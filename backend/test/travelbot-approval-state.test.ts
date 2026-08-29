import assert from "node:assert/strict";
import test from "node:test";

import { Aes256GcmApprovalStateProtector } from "../src/modules/travelbot/index.js";

test("resumable SDK approval state is authenticated and encrypted at rest", async () => {
  const protector = new Aes256GcmApprovalStateProtector(Buffer.alloc(32, 7).toString("base64"));
  const raw = JSON.stringify({ user_message: "texto privado", internal_prompt: "não persistir aberto" });
  const sealed = await protector.seal(raw);

  assert.match(sealed, /^v1\./);
  assert.equal(sealed.includes("texto privado"), false);
  assert.equal(await protector.open(sealed), raw);
  await assert.rejects(protector.open(`${sealed.slice(0, -1)}x`));
});
