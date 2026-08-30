import assert from "node:assert/strict";
import test from "node:test";

import {
  agentAssuranceClaimSchema,
  agentAttestationStatusSchema,
  agentPassportClaimsSchema,
  agentTrustSnapshotSchema,
  authAssuranceSchema,
  principalSessionViewSchema,
  reasonCodeSchema,
} from "../src/contracts/v1/index.js";

test("BE-14 trust and session contracts expose only normalized privacy-safe state", () => {
  assert.deepEqual(agentAttestationStatusSchema.options, [
    "PENDING", "VERIFIED", "REJECTED", "EXPIRED", "REVOKED", "ERROR",
  ]);
  assert.deepEqual(agentAssuranceClaimSchema.options, [
    "OPERATOR_IDENTITY", "ORGANIZATION_OWNERSHIP", "AGENT_OPERATOR_BINDING", "BUILD_PROVENANCE",
  ]);
  assert.deepEqual(authAssuranceSchema.options, ["DEMO", "OIDC"]);

  assert.deepEqual(principalSessionViewSchema.parse({
    authenticated: true,
    principal: { principal_id: "principal_marta", display_name: "Marta" },
    assurance: "DEMO",
    demo: true,
    csrf_token: "csrf_safe_browser_token_123456",
    expires_at: "2026-08-29T20:00:00.000Z",
  }), {
    authenticated: true,
    principal: { principal_id: "principal_marta", display_name: "Marta" },
    assurance: "DEMO",
    demo: true,
    csrf_token: "csrf_safe_browser_token_123456",
    expires_at: "2026-08-29T20:00:00.000Z",
  });
  assert.throws(() => principalSessionViewSchema.parse({
    authenticated: true,
    principal: { principal_id: "principal_marta", display_name: "Marta", email: "marta@example.com" },
    assurance: "DEMO",
    demo: true,
    csrf_token: "csrf_safe_browser_token_123456",
    expires_at: "2026-08-29T20:00:00.000Z",
  }));
});

test("BE-14 trust snapshot and passport bind principal, key and build without PII", () => {
  const trust = {
    mode: "EXTERNAL_REQUIRED",
    agent_id: "agent_travelbot",
    principal_id: "principal_marta",
    operational_status: "ACTIVE",
    attestation_status: "VERIFIED",
    attestation_id: "attestation_123",
    key_id: "key_travelbot_2026_01",
    build_fingerprint: "a".repeat(64),
    provider: "didit",
    assurance_claims: ["OPERATOR_IDENTITY"],
    assurance_level: "EXTERNAL_OPERATOR_IDENTITY",
    binding_hash: "b".repeat(64),
    evidence_reference_hash: "c".repeat(64),
    issued_at: "2026-08-29T12:00:00.000Z",
    expires_at: "2026-08-30T12:00:00.000Z",
  } as const;
  assert.deepEqual(agentTrustSnapshotSchema.parse(trust), trust);

  const passport = {
    iss: "https://bound.example",
    jti: "passport_123",
    sub: "agent_travelbot",
    principal_ref: "d".repeat(64),
    key_id: "key_travelbot_2026_01",
    build_fingerprint: "a".repeat(64),
    assurance_claims: ["OPERATOR_IDENTITY"],
    assurance_level: "EXTERNAL_OPERATOR_IDENTITY",
    provider: "didit",
    evidence_reference_hash: "c".repeat(64),
    purpose: "agent-commerce-authorization",
    aud: "bound-verify",
    iat: 1788004800,
    exp: 1788008400,
  } as const;
  assert.deepEqual(agentPassportClaimsSchema.parse(passport), passport);
  assert.throws(() => agentPassportClaimsSchema.parse({ ...passport, email: "marta@example.com" }));
});

test("BE-14 stable attestation reasons are part of the v1 authorization contract", () => {
  for (const reason of [
    "agent_attestation_required",
    "agent_attestation_pending",
    "agent_attestation_rejected",
    "agent_attestation_expired",
    "agent_attestation_revoked",
    "agent_attestation_binding_mismatch",
    "agent_attestation_provider_unavailable",
  ]) assert.equal(reasonCodeSchema.parse(reason), reason);
});
