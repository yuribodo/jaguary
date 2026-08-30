import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { PublicApiError } from "../src/contracts/v1/index.js";
import { OpenAIRealtimeVoiceSessionIssuer } from "../src/modules/travelbot/voice.js";

test("realtime voice secrets keep the API key server-side and pin the voice session behavior", async () => {
  let request: { url: string; init?: RequestInit } | undefined;
  const issuer = new OpenAIRealtimeVoiceSessionIssuer({
    apiKey: "sk-server-only",
    realtimeModel: "gpt-realtime-2.1",
    transcriptionModel: "gpt-live-transcribe",
    voice: "marin",
    timeoutMs: 5_000,
    fetch: (async (url, init) => {
      request = { url: String(url), init };
      return new Response(JSON.stringify({
        value: "ek_browser_ephemeral",
        expires_at: 1_788_072_900,
        session: { id: "sess_internal" },
      }), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });

  const result = await issuer.createClientSecret("principal_marta");
  assert.deepEqual(result, { value: "ek_browser_ephemeral", expires_at: 1_788_072_900 });
  assert.equal(request?.url, "https://api.openai.com/v1/realtime/client_secrets");
  const headers = new Headers(request?.init?.headers);
  assert.equal(headers.get("authorization"), "Bearer sk-server-only");
  assert.equal(
    headers.get("openai-safety-identifier"),
    createHash("sha256").update("principal_marta").digest("hex"),
  );
  const body = JSON.parse(String(request?.init?.body)) as {
    session: {
      model: string;
      output_modalities: string[];
      audio: { input: { transcription: { model: string }; turn_detection: Record<string, unknown> }; output: { voice: string } };
    };
  };
  assert.equal(body.session.model, "gpt-realtime-2.1");
  assert.deepEqual(body.session.output_modalities, ["audio"]);
  assert.equal(body.session.audio.input.transcription.model, "gpt-live-transcribe");
  assert.deepEqual(body.session.audio.input.turn_detection, {
    type: "semantic_vad",
    eagerness: "low",
    create_response: false,
    interrupt_response: true,
  });
  assert.equal(body.session.audio.output.voice, "marin");
});

test("realtime voice provider failures become a sanitized unavailable error", async () => {
  const issuer = new OpenAIRealtimeVoiceSessionIssuer({
    apiKey: "sk-never-leak",
    realtimeModel: "gpt-realtime-2.1",
    transcriptionModel: "gpt-live-transcribe",
    voice: "cedar",
    timeoutMs: 5_000,
    fetch: (async () => new Response("provider secret details", { status: 500 })) as typeof fetch,
  });
  await assert.rejects(
    () => issuer.createClientSecret("principal_marta"),
    (error: unknown) => {
      assert.ok(error instanceof PublicApiError);
      assert.equal(error.code, "voice_unavailable");
      assert.doesNotMatch(error.message, /provider|secret|sk-never-leak/i);
      return true;
    },
  );
});
