import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { DiditAgentAttestationProvider, diditCanonicalJson } from "../src/modules/trust/didit-provider.js";

const now = new Date("2026-08-29T12:00:00.000Z");
const baseOptions = {
  baseUrl: "https://verification.didit.me",
  apiKey: "api-secret",
  workflowId: "550e8400-e29b-41d4-a716-446655440000",
  biometricWorkflowId: "550e8400-e29b-41d4-a716-446655440010",
  webhookSecret: "webhook-secret",
  timeoutMs: 1000,
  allowedCallbackUrls: [
    "https://bound.example/trust/callback",
    "https://bound.example/biometric-callback",
  ],
};

test("Didit creates a backend-only hosted session without sending PII", async () => {
  let requestBody: Record<string, unknown> | undefined;
  const provider = new DiditAgentAttestationProvider({ ...baseOptions, fetch: async (input, init) => {
    assert.equal(String(input), "https://verification.didit.me/v3/session/");
    assert.equal((init?.headers as Record<string, string>)["x-api-key"], "api-secret");
    requestBody = JSON.parse(String(init?.body));
    return {
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: async () => ({ session_id: "550e8400-e29b-41d4-a716-446655440001", url: "https://verify.didit.me/en/session/opaque-token", status: "Not Started" }),
      arrayBuffer: async () => new ArrayBuffer(0),
    };
  } });
  const result = await provider.createAssessment({ attestationId: "attestation_1", agentId: "agent_travelbot", principalId: "principal_marta", vendorData: "opaque-bound-reference", callbackUrl: "https://bound.example/trust/callback" });
  assert.equal(result.status, "PENDING");
  assert.equal(result.hostedUrl, "https://verify.didit.me/en/session/opaque-token");
  assert.deepEqual(requestBody, { workflow_id: baseOptions.workflowId, vendor_data: "opaque-bound-reference", callback: "https://bound.example/trust/callback", callback_method: "both" });
  assert.equal(JSON.stringify(requestBody).includes("principal_marta"), false);
});

test("Didit creates biometric authentication from the approved onboarding portrait without persisting or returning it", async () => {
  const portrait = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
  const calls: string[] = [];
  let requestBody: Record<string, unknown> | undefined;
  const provider = new DiditAgentAttestationProvider({
    ...baseOptions,
    fetch: async (input, init) => {
      const url = String(input);
      calls.push(url);
      if (url.endsWith("/v3/session/550e8400-e29b-41d4-a716-446655440001/decision/")) {
        return new Response(JSON.stringify({
          session_id: "550e8400-e29b-41d4-a716-446655440001",
          status: "Approved",
          id_verifications: [{
            portrait_image: "https://service-didit-verification-production-a1c5f9b8.s3.amazonaws.com/reference.png",
          }],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url === "https://service-didit-verification-production-a1c5f9b8.s3.amazonaws.com/reference.png") {
        return new Response(portrait, { status: 200, headers: { "content-type": "image/png", "content-length": String(portrait.byteLength) } });
      }
      assert.equal(url, "https://verification.didit.me/v3/session/");
      requestBody = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({
        session_id: "550e8400-e29b-41d4-a716-446655440011",
        url: "https://verify.didit.me/en/session/biometric-token",
        status: "Not Started",
      }), { status: 201 });
    },
  });

  const result = await provider.createBiometricAuthentication({
    referenceAssessmentId: "550e8400-e29b-41d4-a716-446655440001",
    vendorData: "opaque-consent-reference",
    callbackUrl: "https://bound.example/biometric-callback",
  });

  assert.equal(result.assessmentId, "550e8400-e29b-41d4-a716-446655440011");
  assert.equal(result.hostedUrl, "https://verify.didit.me/en/session/biometric-token");
  assert.deepEqual(requestBody, {
    workflow_id: baseOptions.biometricWorkflowId,
    vendor_data: "opaque-consent-reference",
    callback: "https://bound.example/biometric-callback",
    callback_method: "both",
    portrait_image: portrait.toString("base64"),
  });
  assert.deepEqual(calls, [
    "https://verification.didit.me/v3/session/550e8400-e29b-41d4-a716-446655440001/decision/",
    "https://service-didit-verification-production-a1c5f9b8.s3.amazonaws.com/reference.png",
    "https://verification.didit.me/v3/session/",
  ]);
  assert.equal(JSON.stringify(result).includes(portrait.toString("base64")), false);
});

test("Didit normalizes all ten official statuses without ever producing ALLOW", async () => {
  const statuses = new Map([
    ["Not Started", "PENDING"], ["In Progress", "PENDING"], ["In Review", "PENDING"], ["Resubmitted", "PENDING"], ["Awaiting User", "PENDING"],
    ["Approved", "VERIFIED"], ["Declined", "REJECTED"], ["Expired", "EXPIRED"], ["Abandoned", "REJECTED"], ["Kyc Expired", "EXPIRED"],
  ]);
  for (const [status, expected] of statuses) {
    const provider = new DiditAgentAttestationProvider({ ...baseOptions, fetch: async () => new Response(JSON.stringify({ session_id: "550e8400-e29b-41d4-a716-446655440001", status, vendor_user_id: "opaque-provider-subject", created_at: now.toISOString() }), { status: 200 }) });
    const result = await provider.getAssessment("550e8400-e29b-41d4-a716-446655440001");
    assert.equal(result.status, expected, status);
    assert.equal("decision" in result, false);
    assert.deepEqual(result.claims, status === "Approved" ? ["PRINCIPAL_IDENTITY"] : []);
  }
});

test("Didit verifies a V3 destination X-Signature-V2 and freshness before normalizing a webhook", async () => {
  const body = { event_id: "550e8400-e29b-41d4-a716-446655440099", webhook_type: "status.updated", timestamp: Math.floor(now.getTime() / 1000), created_at: Math.floor(now.getTime() / 1000), application_id: "550e8400-e29b-41d4-a716-446655440098", environment: "sandbox", session_id: "550e8400-e29b-41d4-a716-446655440001", status: "Approved", vendor_user_id: "provider-subject", metadata: { label: "Operação", risk_view: {} }, decision: { liveness_checks: [{ score: 95.4 }], reviews: [] } };
  const rawBody = JSON.stringify(body);
  const signature = createHmac("sha256", baseOptions.webhookSecret).update(diditCanonicalJson(body)).digest("hex");
  const provider = new DiditAgentAttestationProvider(baseOptions);
  const event = await provider.verifyWebhook({ rawBody, headers: { "x-timestamp": String(body.timestamp), "x-signature-v2": signature }, now });
  assert.equal(event.status, "VERIFIED");
  assert.equal(event.eventId, body.event_id);
  await assert.rejects(() => provider.verifyWebhook({ rawBody, headers: { "x-timestamp": String(body.timestamp), "x-signature-v2": "0".repeat(64) }, now }), /signature/);
  await assert.rejects(() => provider.verifyWebhook({ rawBody, headers: { "x-timestamp": String(body.timestamp), "x-signature-v2": signature }, now: new Date(now.getTime() + 301_000) }), /freshness/);
});

test("Didit timeout, 429 and 5xx fail closed after bounded retries", async () => {
  for (const response of [new Response(null, { status: 429 }), new Response(null, { status: 503 })]) {
    let calls = 0;
    const provider = new DiditAgentAttestationProvider({ ...baseOptions, fetch: async () => { calls += 1; return response.clone(); } });
    await assert.rejects(() => provider.getAssessment("550e8400-e29b-41d4-a716-446655440001"), /unavailable/);
    assert.equal(calls, 3);
  }
});
