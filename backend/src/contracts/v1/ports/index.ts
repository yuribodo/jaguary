import type { NormalizedAuthorization, AuthorizedCheckout } from "../authorization/schemas.js";
import type { MerchantCapabilities, NormalizedCheckout, PurchaseIntent } from "../commerce/schemas.js";
import type { Signature, SignatureAlgorithm } from "../common/primitives.js";
import type { AuthorizedPayment, PaymentResult } from "../payments/schemas.js";
import type { OrderReceipt } from "../receipts/schemas.js";
import type {
  AgentHttpRequest,
  AgentIdentity,
  AgentRegistration,
  VerifiedAgentRequest,
} from "../identity/schemas.js";

export interface CommerceProtocolAdapter {
  discoverProfile(merchant: URL): Promise<MerchantCapabilities>;
  createCheckout(input: PurchaseIntent): Promise<NormalizedCheckout>;
  completeCheckout(input: AuthorizedCheckout): Promise<OrderReceipt>;
}

export interface AuthorizationProofAdapter {
  verify(
    proof: unknown,
    checkout: NormalizedCheckout,
  ): Promise<NormalizedAuthorization>;
}

export interface PaymentExecutor {
  pay(input: AuthorizedPayment, idempotencyKey: string): Promise<PaymentResult>;
}

export interface SignerPort {
  sign(payload: Uint8Array, algorithm?: SignatureAlgorithm): Promise<Signature>;
  verify(payload: Uint8Array, signature: Signature): Promise<boolean>;
}

export interface ClockPort {
  now(): Date;
}

export interface AgentRegistrationContext {
  correlationId: string;
  idempotencyKey: string;
}

export interface AgentRegistrationResult {
  agent: AgentIdentity;
  created: boolean;
}

export interface AgentIdentityRegistryPort {
  register(
    registration: AgentRegistration,
    context: AgentRegistrationContext,
  ): Promise<AgentRegistrationResult>;
  get(agentId: string): Promise<AgentIdentity | undefined>;
}

export interface AgentRequestVerifierPort {
  verify(proof: unknown, request: AgentHttpRequest): Promise<VerifiedAgentRequest>;
}
