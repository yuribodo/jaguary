import type {
  AgentIdentity,
  AuditTimeline,
  CreateMandateDraftInput,
  Mandate,
  MerchantCapabilities,
  NormalizedCheckout,
  OfferCandidate,
  OrderReceipt,
  PaymentMethodSummary,
  PurchaseDispute,
  PurchaseIntent,
  TravelBotConversation,
  TravelWatch,
} from "@/lib/contracts";

const DEFAULT_API_URL = "http://localhost:3001";
const REQUEST_TIMEOUT_MS = 10_000;
const UCP_CAPABILITIES = [
  "dev.ucp.shopping.checkout",
  "dev.ucp.common.payment.ap2_mandate",
].join(",");

export const apiUrl =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? DEFAULT_API_URL;

export type ApiResult<T> = {
  data: T;
  correlationId?: string;
};

export type VoiceSessionClientSecret = {
  value: string;
  expires_at?: number;
};

type ApiErrorBody = {
  error?: { code?: string; message?: string; details?: Record<string, unknown> };
  correlation_id?: string;
};

export class BoundApiError extends Error {
  readonly status?: number;
  readonly code: string;
  readonly correlationId?: string;
  readonly offline: boolean;

  constructor(input: {
    message: string;
    code?: string;
    status?: number;
    correlationId?: string;
    offline?: boolean;
  }) {
    super(input.message);
    this.name = "BoundApiError";
    this.status = input.status;
    this.code = input.code ?? "unknown_error";
    this.correlationId = input.correlationId;
    this.offline = input.offline ?? false;
  }
}

function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function createRequestIdentity(prefix: string): {
  correlationId: string;
  idempotencyKey: string;
} {
  return {
    correlationId: newId(`corr_surface_${prefix}`),
    idempotencyKey: newId(`idem_surface_${prefix}`),
  };
}

async function request<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiResult<T>> {
  let response: Response;
  const requestController = new AbortController();
  const callerSignal = init.signal;
  const forwardCallerAbort = () => requestController.abort(callerSignal?.reason);
  const timeout = setTimeout(() => {
    requestController.abort(new DOMException("Request timed out", "TimeoutError"));
  }, REQUEST_TIMEOUT_MS);

  if (callerSignal?.aborted) forwardCallerAbort();
  else callerSignal?.addEventListener("abort", forwardCallerAbort, { once: true });

  try {
    response = await fetch(`${apiUrl}${path}`, {
      cache: "no-store",
      credentials: "include",
      ...init,
      signal: requestController.signal,
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch (error) {
    if (callerSignal?.aborted) throw error;
    if (
      requestController.signal.reason instanceof DOMException
      && requestController.signal.reason.name === "TimeoutError"
    ) {
      throw new BoundApiError({
        message: "The Jaguary API took more than 10 seconds to respond. Check that the backend is running and try again.",
        code: "api_timeout",
        offline: true,
      });
    }
    throw new BoundApiError({
      message: "Could not reach the Jaguary API.",
      code: "api_offline",
      offline: true,
    });
  } finally {
    clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", forwardCallerAbort);
  }

  const headerCorrelationId = response.headers.get("x-correlation-id") ?? undefined;
  const body = (await response.json().catch(() => undefined)) as ApiErrorBody | T | undefined;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | undefined;
    throw new BoundApiError({
      message: errorBody?.error?.message ?? `The API returned status ${response.status}.`,
      code: errorBody?.error?.code,
      status: response.status,
      correlationId: errorBody?.correlation_id ?? headerCorrelationId,
    });
  }

  if (response.status === 204) {
    return { data: undefined as T, correlationId: headerCorrelationId };
  }

  if (body === undefined) {
    throw new BoundApiError({
      message: "The API returned an invalid JSON body.",
      code: "invalid_response",
      status: response.status,
      correlationId: headerCorrelationId,
    });
  }

  return { data: body as T, correlationId: headerCorrelationId };
}

export const boundApi = {
  getPrincipalSession(signal?: AbortSignal) {
    return request<PrincipalSessionView>("/auth/v1/session", { signal });
  },

  createDemoPrincipalSession(requestIdentity: ReturnType<typeof createRequestIdentity>) {
    return request<AuthenticatedPrincipalSession>("/auth/v1/demo/session", {
      method: "POST",
      headers: { "Idempotency-Key": requestIdentity.idempotencyKey },
    });
  },

  logoutPrincipal(csrfToken: string, requestIdentity: ReturnType<typeof createRequestIdentity>) {
    return request<never>("/auth/v1/logout", {
      method: "POST",
      headers: { "Idempotency-Key": requestIdentity.idempotencyKey, "X-CSRF-Token": csrfToken },
    });
  },

  startAgentAttestation(agentId: string, csrfToken: string, requestIdentity: ReturnType<typeof createRequestIdentity>) {
    return request<AttestationSession>(`/trust/v1/agents/${encodeURIComponent(agentId)}/attestation-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestIdentity.idempotencyKey, "X-Correlation-Id": requestIdentity.correlationId, "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ consent: true }),
    });
  },

  getAgentAssurance(agentId: string, signal?: AbortSignal) {
    return request<AgentAssurance>(`/trust/v1/agents/${encodeURIComponent(agentId)}/assurance`, { signal });
  },

  refreshAgentAttestation(agentId: string, csrfToken: string, requestIdentity: ReturnType<typeof createRequestIdentity>) {
    return request<AgentAssurance>(`/trust/v1/agents/${encodeURIComponent(agentId)}/attestations/refresh`, {
      method: "POST",
      headers: { "Idempotency-Key": requestIdentity.idempotencyKey, "X-Correlation-Id": requestIdentity.correlationId, "X-CSRF-Token": csrfToken },
    });
  },

  startMandateBiometricConsent(mandateId: string, csrfToken: string, requestIdentity: ReturnType<typeof createRequestIdentity>) {
    return request<MandateBiometricConsent>(`/v1/mandates/${encodeURIComponent(mandateId)}/biometric-consent-sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestIdentity.idempotencyKey, "X-Correlation-Id": requestIdentity.correlationId, "X-CSRF-Token": csrfToken },
      body: JSON.stringify({ consent: true }),
    });
  },

  refreshMandateBiometricConsent(mandateId: string, consentId: string, csrfToken: string, requestIdentity: ReturnType<typeof createRequestIdentity>) {
    return request<MandateBiometricConsent>(`/v1/mandates/${encodeURIComponent(mandateId)}/biometric-consent-sessions/${encodeURIComponent(consentId)}/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": requestIdentity.idempotencyKey, "X-Correlation-Id": requestIdentity.correlationId, "X-CSRF-Token": csrfToken },
      body: "{}",
    });
  },
  health(signal?: AbortSignal) {
    return request<{ status: string }>("/health", { signal });
  },

  getAgent(agentId: string, signal?: AbortSignal) {
    return request<AgentIdentity>(`/trust/v1/agents/${agentId}`, { signal });
  },

  getMerchantProfile(signal?: AbortSignal) {
    return request<MerchantCapabilities>("/.well-known/ucp", { signal });
  },

  listOffers(signal?: AbortSignal) {
    return request<OfferCandidate[]>("/merchant/flights", { signal });
  },

  createConversation(
    agentId: string,
    csrfToken: string,
    requestIdentity: ReturnType<typeof createRequestIdentity>,
    signal?: AbortSignal,
  ) {
    return request<TravelBotConversation>("/v1/conversations", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ agent_id: agentId }),
    });
  },

  getConversation(conversationId: string, signal?: AbortSignal) {
    return request<TravelBotConversation>(`/v1/conversations/${conversationId}`, {
      signal,
    });
  },

  discardConversation(
    conversationId: string,
    csrfToken: string,
    requestIdentity: ReturnType<typeof createRequestIdentity>,
  ) {
    return request<never>(`/v1/conversations/${encodeURIComponent(conversationId)}`, {
      method: "DELETE",
      headers: {
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
        "X-CSRF-Token": csrfToken,
      },
    });
  },

  getConversationWatch(conversationId: string, signal?: AbortSignal) {
    return request<TravelWatch | null>(`/v1/conversations/${encodeURIComponent(conversationId)}/watch`, { signal });
  },

  getTravelWatch(watchId: string, signal?: AbortSignal) {
    return request<TravelWatch>(`/v1/travel-watches/${encodeURIComponent(watchId)}`, { signal });
  },

  createTravelWatch(
    conversationId: string,
    input: { mode: "AUTO_PURCHASE"; expires_at: string },
    requestIdentity: ReturnType<typeof createRequestIdentity>,
  ) {
    return request<TravelWatch>(`/v1/conversations/${encodeURIComponent(conversationId)}/watches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
      },
      body: JSON.stringify(input),
    });
  },

  activateTravelWatch(watchId: string, requestIdentity: ReturnType<typeof createRequestIdentity>) {
    return request<TravelWatch>(`/v1/travel-watches/${encodeURIComponent(watchId)}/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
      },
      body: "{}",
    });
  },

  cancelTravelWatch(watchId: string, requestIdentity: ReturnType<typeof createRequestIdentity>) {
    return request<TravelWatch>(`/v1/travel-watches/${encodeURIComponent(watchId)}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
      },
      body: "{}",
    });
  },

  simulateTravelWatchMatch(watchId: string, requestIdentity: ReturnType<typeof createRequestIdentity>) {
    return request<TravelWatch>(`/v1/dev/travel-watches/${encodeURIComponent(watchId)}/simulate-match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
      },
      body: "{}",
    });
  },

  getReceipt(receiptId: string, signal?: AbortSignal) {
    return request<OrderReceipt>(`/receipts/${receiptId}`, { signal });
  },

  listReceipts(signal?: AbortSignal) {
    return request<OrderReceipt[]>("/receipts", { signal });
  },

  getReceiptDispute(receiptId: string, signal?: AbortSignal) {
    return request<PurchaseDispute | null>(`/v1/receipts/${encodeURIComponent(receiptId)}/dispute`, { signal });
  },

  openPurchaseDispute(
    receiptId: string,
    csrfToken: string,
    requestIdentity: ReturnType<typeof createRequestIdentity>,
  ) {
    return request<PurchaseDispute>(`/v1/receipts/${encodeURIComponent(receiptId)}/disputes`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
        "X-CSRF-Token": csrfToken,
      },
      body: JSON.stringify({ reason: "UNRECOGNIZED_PURCHASE" }),
    });
  },

  listPaymentMethods(signal?: AbortSignal) {
    return request<PaymentMethodSummary[]>("/v1/payment-methods", { signal });
  },

  getAuditTimeline(correlationId: string, signal?: AbortSignal) {
    return request<AuditTimeline>(`/audit/${correlationId}`, { signal });
  },

  postConversationMessage(
    conversationId: string,
    content: string,
    csrfToken: string,
    requestIdentity: ReturnType<typeof createRequestIdentity>,
  ) {
    return request<TravelBotConversation>(
      `/v1/conversations/${conversationId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": requestIdentity.idempotencyKey,
          "X-Correlation-Id": requestIdentity.correlationId,
          "X-CSRF-Token": csrfToken,
        },
        body: JSON.stringify({ content }),
      },
    );
  },

  createVoiceSession(
    conversationId: string,
    csrfToken: string,
    requestIdentity: ReturnType<typeof createRequestIdentity>,
  ) {
    return request<VoiceSessionClientSecret>(
      `/v1/conversations/${encodeURIComponent(conversationId)}/voice-sessions`,
      {
        method: "POST",
        headers: {
          "Idempotency-Key": requestIdentity.idempotencyKey,
          "X-Correlation-Id": requestIdentity.correlationId,
          "X-CSRF-Token": csrfToken,
        },
      },
    );
  },

  createCheckout(
    intent: PurchaseIntent,
    requestIdentity: ReturnType<typeof createRequestIdentity>,
  ) {
    return request<NormalizedCheckout>("/ucp/v1/checkout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
        "UCP-Capabilities": UCP_CAPABILITIES,
      },
      body: JSON.stringify(intent),
    });
  },

  createMandateDraft(
    input: CreateMandateDraftInput,
    requestIdentity: ReturnType<typeof createRequestIdentity>,
  ) {
    return request<Mandate>("/v1/mandates", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
      },
      body: JSON.stringify(input),
    });
  },

  getMandate(mandateId: string, signal?: AbortSignal) {
    return request<Mandate>(`/v1/mandates/${mandateId}`, { signal });
  },

  activateMandate(
    mandateId: string,
    requestIdentity: ReturnType<typeof createRequestIdentity>,
  ) {
    return request<Mandate>(`/v1/mandates/${mandateId}/activate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
      },
      body: "{}",
    });
  },

  revokeMandate(
    mandateId: string,
    requestIdentity: ReturnType<typeof createRequestIdentity>,
  ) {
    return request<Mandate>(`/v1/mandates/${mandateId}/revoke`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": requestIdentity.idempotencyKey,
        "X-Correlation-Id": requestIdentity.correlationId,
      },
      body: "{}",
    });
  },
};

export type AuthenticatedPrincipalSession = {
  authenticated: true;
  principal: { principal_id: string; display_name: string };
  assurance: "DEMO" | "OIDC";
  demo: boolean;
  csrf_token: string;
  expires_at: string;
};
export type PrincipalSessionView = { authenticated: false } | AuthenticatedPrincipalSession;
export type AttestationStatus = "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "REVOKED" | "ERROR";
export type AttestationSession = { attestation_id: string | null; status: AttestationStatus | null; expires_at: string | null; hosted_verification_url: string | null };
export type AgentAssurance = {
  agent_id: string;
  operational_status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  attestation_id: string | null;
  attestation_status: AttestationStatus | null;
  provider: "fake" | "didit";
  assurance_claims: Array<"PRINCIPAL_IDENTITY" | "OPERATOR_IDENTITY" | "ORGANIZATION_OWNERSHIP" | "AGENT_OPERATOR_BINDING" | "BUILD_PROVENANCE">;
  assurance_level: "LOCAL_CRYPTOGRAPHIC" | "EXTERNAL_PRINCIPAL_IDENTITY" | "EXTERNAL_OPERATOR_IDENTITY";
  issued_at: string | null;
  expires_at: string | null;
  eligibility: { eligible: boolean; reason?: string };
};
export type MandateBiometricConsent = {
  consent_id: string;
  mandate_id: string;
  status: "PREPARING" | "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "ERROR" | "CONSUMED";
  terms_hash: string;
  expires_at: string;
  hosted_verification_url: string | null;
};
