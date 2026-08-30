import assert from "node:assert/strict";
import test from "node:test";

import { Aes256GcmApprovalStateProtector } from "../src/modules/travelbot/index.js";

test("resumable SDK approval state is authenticated and encrypted at rest", async () => {
  const protector = new Aes256GcmApprovalStateProtector(Buffer.alloc(32, 7).toString("base64"));
  const raw = JSON.stringify({ user_message: "private text", internal_prompt: "do not persist in plaintext" });
  const sealed = await protector.seal(raw);

  assert.match(sealed, /^v1\./);
  assert.equal(sealed.includes("texto privado"), false);
  assert.equal(await protector.open(sealed), raw);
  const [version, iv, tag, encrypted] = sealed.split(".") as [string, string, string, string];
  const tamperedTag = `${tag[0] === "A" ? "B" : "A"}${tag.slice(1)}`;
  await assert.rejects(protector.open([version, iv, tamperedTag, encrypted].join(".")));
});
