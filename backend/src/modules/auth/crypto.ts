import { createHash, createHmac, randomBytes } from "node:crypto";

export function randomOpaqueToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function sha256Text(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export class AuthCrypto {
  readonly #key: Buffer;
  constructor(secret: string | Buffer) {
    this.#key = createHash("sha256").update(secret).digest();
  }
  csrfToken(sessionToken: string): string {
    return createHmac("sha256", this.#key).update(`csrf:${sessionToken}`).digest("base64url");
  }
}
