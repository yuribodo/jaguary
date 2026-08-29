import {
  authorizationDecisionSchema,
  canonicalizeJson,
  PublicApiError,
  reasonCodeSchema,
  sha256CanonicalJson,
  verifiedAgentRequestSchema,
  type AgentIdentityRegistryPort,
  type AgentIdentity,
  type AgentRequestProof,
  type AgentRequestVerifierPort,
  type AuthorizationDecision,
  type AuthorizationUsage,
  type ClockPort,
  type Mandate,
  type NonceStatus,
  type NormalizedAuthorization,
  type NormalizedCheckout,
  type PolicyEvaluation,
  type SignerPort,
  type VerifiedAgentRequest,
} from "../../contracts/v1/index.js";

import { evaluate } from "./policy.js";

const encoder = new TextEncoder();

export interface VerifyRequestBody {
  authorization: NormalizedAuthorization;
  checkout: NormalizedCheckout;
}

export interface VerifyRequest {
  request_body: VerifyRequestBody;
  proof: AgentRequestProof;
}

export interface ReservationInspection {
  usage: AuthorizationUsage;
  nonce_status: NonceStatus;
  idempotent_decision?: AuthorizationDecision;
}

export interface ReservationInspectionCommand {
  request: VerifyRequest;
  request_hash: string;
  idempotency_key: string;
  now: Date;
}

export interface ReservationCommand extends ReservationInspectionCommand {
  correlation_id: string;
  agent_request: VerifiedAgentRequest;
  verified_agent: AgentIdentity;
  mandate_signature_valid: boolean;
  checkout_signature_valid: boolean;
  human_approval_required: boolean;
  evaluation: PolicyEvaluation;
}

export interface DecisionAuditCommand extends ReservationInspectionCommand {
  correlation_id: string;
  evaluation: PolicyEvaluation;
}

export interface AuthorizationReservationPort {
  inspect(command: ReservationInspectionCommand): Promise<ReservationInspection>;
  recordDecision(command: DecisionAuditCommand): Promise<void>;
  reserve(command: ReservationCommand): Promise<AuthorizationDecision>;
}

export interface VerifyOrchestratorOptions {
  agentRegistry: Pick<AgentIdentityRegistryPort, "get">;
  agentVerifier: AgentRequestVerifierPort;
  mandateLoader: { getMandate(mandateId: string): Promise<Mandate> };
  mandateSignatureVerifier: Pick<SignerPort, "verify">;
  checkoutVerifier: { verify(checkout: NormalizedCheckout): Promise<boolean> };
  reservationStore: AuthorizationReservationPort;
  clock: ClockPort;
  humanApprovalRequired(input: VerifyRequestBody): boolean;
}

function decisionFrom(evaluation: PolicyEvaluation): AuthorizationDecision {
  return authorizationDecisionSchema.parse({
    decision: evaluation.decision,
    reasons: evaluation.reasons,
    policy_version: evaluation.policy_version,
    evidence_hash: sha256CanonicalJson(evaluation),
  });
}

async function loadMandateOrUndefined(
  loader: VerifyOrchestratorOptions["mandateLoader"],
  mandateId: string,
): Promise<Mandate | undefined> {
  try {
    return await loader.getMandate(mandateId);
  } catch (error) {
    if (error instanceof PublicApiError && error.code === "not_found") return undefined;
    throw error;
  }
}

export class VerifyOrchestrator {
  constructor(private readonly options: VerifyOrchestratorOptions) {}

  async verify(
    request: VerifyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<AuthorizationDecision> {
    const { authorization, checkout } = request.request_body;
    const now = this.options.clock.now();
    let agentRequest: VerifiedAgentRequest | undefined;
    try {
      agentRequest = await this.options.agentVerifier.verify(request.proof, {
        method: "POST",
        route: "/verify",
        body: request.request_body,
      });
    } catch (error) {
      if (!(error instanceof PublicApiError) || !reasonCodeSchema.safeParse(error.code).success) {
        throw error;
      }
      if (error.code !== "invalid_agent_signature") {
        agentRequest = verifiedAgentRequestSchema.parse({
          agent_id: request.proof.payload.agent_id,
          key_id: request.proof.payload.key_id,
          build_fingerprint: request.proof.payload.build_fingerprint,
          nonce: request.proof.payload.nonce,
          issued_at: request.proof.payload.issued_at,
          expires_at: request.proof.payload.expires_at,
        });
      }
    }
    const [agent, mandate, checkoutSignatureValid] = await Promise.all([
      this.options.agentRegistry.get(agentRequest?.agent_id ?? request.proof.payload.agent_id),
      loadMandateOrUndefined(this.options.mandateLoader, authorization.mandate_id),
      this.options.checkoutVerifier.verify(checkout),
    ]);
    const mandateSignatureValid = mandate !== undefined && "principal_signature" in mandate
      ? await this.options.mandateSignatureVerifier.verify(
        encoder.encode(canonicalizeJson(mandate.terms)),
        mandate.principal_signature,
      )
      : false;
    const requestHash = sha256CanonicalJson(request.request_body);
    const inspectionCommand: ReservationInspectionCommand = {
      request,
      request_hash: requestHash,
      idempotency_key: idempotencyKey,
      now,
    };
    const inspection = await this.options.reservationStore.inspect(inspectionCommand);
    const humanApprovalRequired = this.options.humanApprovalRequired(request.request_body);
    const evaluation = evaluate({
      agent,
      agent_request: agentRequest,
      mandate,
      mandate_signature_valid: mandateSignatureValid,
      authorization,
      checkout,
      checkout_signature_valid: checkoutSignatureValid,
      human_approval_required: humanApprovalRequired,
      now: now.toISOString(),
      usage: inspection.usage,
      nonce_status: inspection.nonce_status,
    });
    if (evaluation.decision !== "ALLOW") {
      await this.options.reservationStore.recordDecision({
        ...inspectionCommand,
        correlation_id: correlationId,
        evaluation,
      });
      return decisionFrom(evaluation);
    }
    if (inspection.idempotent_decision !== undefined) return inspection.idempotent_decision;
    if (agentRequest === undefined || agent === undefined) {
      throw new Error("ALLOW evaluation is missing verified agent state");
    }

    return this.options.reservationStore.reserve({
      ...inspectionCommand,
      correlation_id: correlationId,
      agent_request: agentRequest,
      verified_agent: agent,
      mandate_signature_valid: mandateSignatureValid,
      checkout_signature_valid: checkoutSignatureValid,
      human_approval_required: humanApprovalRequired,
      evaluation,
    });
  }
}
