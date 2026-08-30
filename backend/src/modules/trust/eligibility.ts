import { sha256CanonicalJson, type AgentEligibilityContext, type AgentEligibilityDecision, type AgentTrustSnapshot, type ReasonCode } from "../../contracts/v1/index.js";

export function agentBindingHash(input: { agentId: string; principalId: string; keyId: string; buildFingerprint: string }): string {
  return sha256CanonicalJson({ agent_id: input.agentId, principal_id: input.principalId, key_id: input.keyId, build_fingerprint: input.buildFingerprint });
}

export function evaluateAgentEligibility(trust: AgentTrustSnapshot, context: AgentEligibilityContext, now: Date): AgentEligibilityDecision {
  let reason: ReasonCode | undefined;
  if (trust.operational_status !== "ACTIVE") reason = "agent_not_active";
  else if (context.purpose === "OPERATOR" && trust.principal_id !== context.principal_id) reason = "agent_attestation_binding_mismatch";
  else if (trust.mode === "EXTERNAL_REQUIRED") {
    if (trust.attestation_status === null) reason = "agent_attestation_required";
    else if (trust.attestation_status === "PENDING") reason = "agent_attestation_pending";
    else if (trust.attestation_status === "REJECTED") reason = "agent_attestation_rejected";
    else if (trust.attestation_status === "EXPIRED") reason = "agent_attestation_expired";
    else if (trust.attestation_status === "REVOKED") reason = "agent_attestation_revoked";
    else if (trust.attestation_status === "ERROR") reason = "agent_attestation_provider_unavailable";
    else if (trust.expires_at === null || now.getTime() >= Date.parse(trust.expires_at)) reason = "agent_attestation_expired";
    else if (trust.binding_hash !== agentBindingHash({ agentId: trust.agent_id, principalId: trust.principal_id, keyId: trust.key_id, buildFingerprint: trust.build_fingerprint })) reason = "agent_attestation_binding_mismatch";
  }
  return { eligible: reason === undefined, ...(reason === undefined ? {} : { reason }), trust };
}
