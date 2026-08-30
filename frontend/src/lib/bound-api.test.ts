import assert from "node:assert/strict";
import test from "node:test";

import { boundApi, BoundApiError, createRequestIdentity } from "@/lib/bound-api";

test("uses a longer deadline for a conversation turn than for a health check", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const scheduledDelays: number[] = [];

  globalThis.setTimeout = ((_: TimerHandler, delay?: number) => {
    scheduledDelays.push(delay ?? 0);
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
  globalThis.fetch = (async () => new Response("{}", {
    status: 200,
    headers: { "Content-Type": "application/json" },
  })) as typeof fetch;

  try {
    await boundApi.health();
    await boundApi.postConversationMessage(
      "conversation-1",
      "Find me a flight",
      "csrf-token",
      createRequestIdentity("conversation_message"),
    );

    assert.deepEqual(scheduledDelays, [10_000, 60_000]);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test("reports a slow request without claiming the API is offline", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let expireRequest: (() => void) | undefined;

  globalThis.setTimeout = ((callback: TimerHandler) => {
    expireRequest = callback as () => void;
    return 1 as unknown as ReturnType<typeof setTimeout>;
  }) as unknown as typeof setTimeout;
  globalThis.clearTimeout = (() => undefined) as typeof clearTimeout;
  globalThis.fetch = ((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
  })) as typeof fetch;

  try {
    const pendingRequest = boundApi.health();
    expireRequest?.();

    await assert.rejects(pendingRequest, (error: unknown) => {
      assert.ok(error instanceof BoundApiError);
      assert.equal(error.code, "api_timeout");
      assert.equal(error.offline, false);
      assert.equal(error.message, "The request is taking longer than expected. Try again in a moment.");
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
