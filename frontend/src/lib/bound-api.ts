import type {
  AgentIdentity,
  AuditTimeline,
  CreateMandateDraftInput,
  Mandate,
  MerchantCapabilities,
  NormalizedCheckout,
  OfferCandidate,
  PurchaseIntent,
} from "@/lib/contracts";

const DEFAULT_API_URL = "http://localhost:3001";
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

  try {
    response = await fetch(`${apiUrl}${path}`, {
      cache: "no-store",
      ...init,
      headers: {
        Accept: "application/json",
        ...init.headers,
      },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new BoundApiError({
      message: "Não foi possível alcançar a API do Bound.",
      code: "api_offline",
      offline: true,
    });
  }

  const headerCorrelationId = response.headers.get("x-correlation-id") ?? undefined;
  const body = (await response.json().catch(() => undefined)) as ApiErrorBody | T | undefined;

  if (!response.ok) {
    const errorBody = body as ApiErrorBody | undefined;
    throw new BoundApiError({
      message: errorBody?.error?.message ?? `A API respondeu com status ${response.status}.`,
      code: errorBody?.error?.code,
      status: response.status,
      correlationId: errorBody?.correlation_id ?? headerCorrelationId,
    });
  }

  if (body === undefined) {
    throw new BoundApiError({
      message: "A API respondeu sem um corpo JSON válido.",
      code: "invalid_response",
      status: response.status,
      correlationId: headerCorrelationId,
    });
  }

  return { data: body as T, correlationId: headerCorrelationId };
}

export const boundApi = {
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

  getAuditTimeline(correlationId: string, signal?: AbortSignal) {
    return request<AuditTimeline>(`/audit/${encodeURIComponent(correlationId)}`, { signal });
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
