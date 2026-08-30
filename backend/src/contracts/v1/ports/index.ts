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
import type { AuthAssurance, SanitizedPrincipal } from "../auth/schemas.js";
import type { AgentAssuranceClaim, AgentTrustSnapshot } from "../trust/schemas.js";

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

export interface LoginStartInput {
  state: string;
  nonce: string;
  codeChallenge: string;
  callbackUrl: string;
}
export interface LoginAuthorization { url: string }
export interface LoginCallbackInput {
  code: string;
  codeVerifier: string;
  expectedNonce: string;
  callbackUrl: string;
}
export interface VerifiedExternalIdentity {
  provider: string;
  issuer: string;
  subject: string;
  displayName: string;
  verifiedEmail?: string;
  assurance: "OIDC";
}
export interface PrincipalIdentityProviderPort {
  createAuthorizationRequest(input: LoginStartInput): Promise<LoginAuthorization>;
  verifyCallback(input: LoginCallbackInput): Promise<VerifiedExternalIdentity>;
}

export interface PrincipalSession {
  sessionId: string;
  principal: SanitizedPrincipal;
  tokenHash: string;
  csrfTokenHash: string;
  assurance: AuthAssurance;
  issuedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
}
export interface CreatePrincipalSession {
  principal: SanitizedPrincipal;
  assurance: AuthAssurance;
  now: Date;
  expiresAt: Date;
  rotatedFromSessionId?: string;
}
export interface IssuedPrincipalSession {
  session: PrincipalSession;
  token: string;
  csrfToken: string;
}
export interface PrincipalSessionRepositoryPort {
  create(input: CreatePrincipalSession): Promise<IssuedPrincipalSession>;
  getByTokenHash(tokenHash: string, now: Date): Promise<PrincipalSession | undefined>;
  rotate(sessionId: string, now: Date): Promise<IssuedPrincipalSession>;
  revoke(sessionId: string, now: Date): Promise<void>;
}

export interface CreateAssessmentInput {
  attestationId: string;
  agentId: string;
  principalId: string;
  vendorData: string;
  callbackUrl: string;
}
export interface ProviderAssessmentSession {
  provider: "fake" | "didit";
  assessmentId: string;
  status: "PENDING";
  hostedUrl: string;
  expiresAt?: Date;
}
export interface ProviderAssessmentResult {
  provider: "fake" | "didit";
  assessmentId: string;
  subjectReference: string | null;
  status: "PENDING" | "VERIFIED" | "REJECTED" | "EXPIRED" | "ERROR";
  claims: AgentAssuranceClaim[];
  evidenceHash: string;
  providerCreatedAt: Date;
  failureCode?: string;
}
export interface RawProviderWebhook { rawBody: string; headers: Record<string, string | undefined>; now: Date }
export interface NormalizedProviderEvent extends ProviderAssessmentResult { eventId: string }
export interface AgentAttestationProviderPort {
  createAssessment(input: CreateAssessmentInput): Promise<ProviderAssessmentSession>;
  getAssessment(providerAssessmentId: string): Promise<ProviderAssessmentResult>;
  verifyWebhook(input: RawProviderWebhook): Promise<NormalizedProviderEvent>;
}
export interface AgentTrustRepositoryPort {
  findAssessmentByIdempotencyKey(idempotencyKey: string): Promise<AgentTrustSnapshot | undefined>;
  createAssessment(command: {
    attestationId: string;
    agentId: string;
    principalId: string;
    keyId: string;
    buildFingerprint: string;
    provider: "fake" | "didit";
    providerAssessmentId: string;
    bindingHash: string;
    evidenceHash: string;
    correlationId: string;
    idempotencyKey: string;
    now: Date;
  }): Promise<AgentTrustSnapshot>;
  applyProviderEvent(command: {
    event: NormalizedProviderEvent;
    now: Date;
    correlationId: string;
  }): Promise<{ trust: AgentTrustSnapshot; applied: boolean }>;
  getCurrent(agentId: string, now: Date): Promise<AgentTrustSnapshot>;
  revokeCurrent(agentId: string, now: Date, correlationId: string): Promise<AgentTrustSnapshot>;
}
export interface AgentEligibilityDecision {
  eligible: boolean;
  reason?: import("../authorization/schemas.js").ReasonCode;
  trust: AgentTrustSnapshot;
}
export type AgentEligibilityContext =
  | { purpose: "EXECUTION" }
  | { purpose: "OPERATOR"; principal_id: string };
export interface AgentEligibilityPort {
  evaluate(agentId: string, context: AgentEligibilityContext, now: Date): Promise<AgentEligibilityDecision>;
}
