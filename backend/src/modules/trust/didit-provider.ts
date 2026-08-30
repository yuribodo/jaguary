import { createHmac, timingSafeEqual } from "node:crypto";

import {
  sha256CanonicalJson,
  type AgentAttestationProviderPort,
  type AgentAssuranceClaim,
  type CreateAssessmentInput,
  type NormalizedProviderEvent,
  type ProviderAssessmentResult,
  type ProviderAssessmentSession,
  type RawProviderWebhook,
} from "../../contracts/v1/index.js";

export interface DiditAgentAttestationProviderOptions {
  baseUrl: string;
  apiKey: string;
  workflowId: string;
  webhookSecret: string;
  timeoutMs: number;
  allowedCallbackUrls: readonly string[];
  fetch?: typeof globalThis.fetch;
  now?: () => Date;
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.keys(value as Record<string, unknown>).sort((left, right) => left.localeCompare(right)).map((key) => [key, sortJson((value as Record<string, unknown>)[key])]));
  }
  return value;
}
export function diditCanonicalJson(value: unknown): string { return JSON.stringify(sortJson(value)); }

type NormalizedStatus = ProviderAssessmentResult["status"];
function normalizeStatus(value: unknown): { status: NormalizedStatus; failureCode?: string } {
  switch (value) {
    case "Not Started": case "In Progress": case "In Review": case "Resubmitted": case "Awaiting User": return { status: "PENDING" };
    case "Approved": return { status: "VERIFIED" };
    case "Declined": case "Abandoned": return { status: "REJECTED", failureCode: value === "Declined" ? "provider_declined" : "provider_abandoned" };
    case "Expired": case "Kyc Expired": return { status: "EXPIRED", failureCode: "provider_expired" };
    default: return { status: "ERROR", failureCode: "unknown_provider_status" };
  }
}
function providerDate(value: unknown, fallback: Date): Date {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000);
  if (typeof value === "string" && !Number.isNaN(Date.parse(value))) return new Date(value);
  return fallback;
}
function safeAssessment(value: Record<string, unknown>, fallbackNow: Date): ProviderAssessmentResult {
  if (typeof value.session_id !== "string") throw new Error("Didit response is unavailable");
  const normalized = normalizeStatus(value.status);
  const claims: AgentAssuranceClaim[] = normalized.status === "VERIFIED" ? ["OPERATOR_IDENTITY"] : [];
  const subjectReference = normalized.status === "VERIFIED"
    ? (typeof value.vendor_user_id === "string" ? value.vendor_user_id : value.session_id)
    : null;
  const providerCreatedAt = providerDate(value.created_at ?? value.timestamp, fallbackNow);
  return {
    provider: "didit",
    assessmentId: value.session_id,
    subjectReference,
    status: normalized.status,
    claims,
    evidenceHash: sha256CanonicalJson({ provider: "didit", assessment_id: value.session_id, status: normalized.status, claims, provider_created_at: providerCreatedAt.toISOString() }),
    providerCreatedAt,
    ...(normalized.failureCode === undefined ? {} : { failureCode: normalized.failureCode }),
  };
}

export class DiditAgentAttestationProvider implements AgentAttestationProviderPort {
  readonly #fetch: typeof globalThis.fetch;
  readonly #baseUrl: string;
  readonly #callbacks: Set<string>;
  constructor(private readonly options: DiditAgentAttestationProviderOptions) {
    const base = new URL(options.baseUrl);
    if (base.protocol !== "https:" || base.hostname !== "verification.didit.me" || base.port !== "" || !["", "/"].includes(base.pathname)) throw new Error("Didit base URL is not allowlisted");
    this.#baseUrl = base.origin;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#callbacks = new Set(options.allowedCallbackUrls);
  }

  async #request(path: string, init: RequestInit): Promise<Response> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await this.#fetch(`${this.#baseUrl}${path}`, { ...init, redirect: "error", signal: AbortSignal.timeout(this.options.timeoutMs) });
        if (response.status !== 429 && response.status < 500) return response;
      } catch {
        // Retry only this bounded provider boundary; callers never run it in a transaction.
      }
    }
    throw new Error("Didit provider unavailable");
  }

  async createAssessment(input: CreateAssessmentInput): Promise<ProviderAssessmentSession> {
    if (!this.#callbacks.has(input.callbackUrl)) throw new Error("Didit callback is not allowlisted");
    const response = await this.#request("/v3/session/", {
      method: "POST",
      headers: { "x-api-key": this.options.apiKey, "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ workflow_id: this.options.workflowId, vendor_data: input.vendorData, callback: input.callbackUrl, callback_method: "both" }),
    });
    if (response.status !== 201) throw new Error("Didit session creation failed");
    const value = await response.json() as Record<string, unknown>;
    if (typeof value.session_id !== "string" || typeof value.url !== "string" || value.status !== "Not Started") throw new Error("Didit session response is invalid");
    const hostedUrl = new URL(value.url);
    if (hostedUrl.protocol !== "https:" || hostedUrl.hostname !== "verify.didit.me" || hostedUrl.username !== "" || hostedUrl.password !== "") throw new Error("Didit hosted URL is invalid");
    return { provider: "didit", assessmentId: value.session_id, status: "PENDING", hostedUrl: hostedUrl.toString() };
  }

  async getAssessment(providerAssessmentId: string): Promise<ProviderAssessmentResult> {
    if (!/^[0-9a-f-]{36}$/i.test(providerAssessmentId)) throw new Error("Didit assessment reference is invalid");
    const response = await this.#request(`/v3/session/${encodeURIComponent(providerAssessmentId)}/decision/`, { method: "GET", headers: { "x-api-key": this.options.apiKey, accept: "application/json" } });
    if (!response.ok) throw new Error("Didit provider unavailable");
    return safeAssessment(await response.json() as Record<string, unknown>, this.options.now?.() ?? new Date());
  }

  async verifyWebhook(input: RawProviderWebhook): Promise<NormalizedProviderEvent> {
    const timestamp = input.headers["x-timestamp"];
    const signature = input.headers["x-signature-v2"];
    const timestampNumber = timestamp === undefined ? Number.NaN : Number(timestamp);
    if (!Number.isInteger(timestampNumber) || Math.abs(Math.floor(input.now.getTime() / 1000) - timestampNumber) > 300) throw new Error("Didit webhook freshness validation failed");
    let value: Record<string, unknown>;
    try { value = JSON.parse(input.rawBody) as Record<string, unknown>; } catch { throw new Error("Didit webhook body is invalid"); }
    if (signature === undefined || !/^[a-f0-9]{64}$/.test(signature)) throw new Error("Didit webhook signature validation failed");
    const expected = createHmac("sha256", this.options.webhookSecret).update(diditCanonicalJson(value), "utf8").digest("hex");
    if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) throw new Error("Didit webhook signature validation failed");
    if (value.webhook_type !== "status.updated" || typeof value.event_id !== "string") throw new Error("Didit webhook event is unsupported");
    return { ...safeAssessment(value, input.now), eventId: value.event_id };
  }
}
