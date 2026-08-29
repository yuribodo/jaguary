import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export interface ApprovalStateProtectorPort {
  seal(value: string): Promise<string>;
  open(value: string): Promise<string>;
}

export class Aes256GcmApprovalStateProtector implements ApprovalStateProtectorPort {
  readonly #key: Buffer;

  constructor(base64Key: string) {
    this.#key = Buffer.from(base64Key, "base64");
    if (this.#key.byteLength !== 32) throw new Error("Approval state encryption key must be 32 bytes");
  }

  async seal(value: string): Promise<string> {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.#key, iv);
    const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return `v1.${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${encrypted.toString("base64url")}`;
  }

  async open(value: string): Promise<string> {
    const [version, iv, tag, encrypted] = value.split(".");
    if (version !== "v1" || iv === undefined || tag === undefined || encrypted === undefined) {
      throw new Error("Approval state envelope is invalid");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.#key, Buffer.from(iv, "base64url"));
    decipher.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(encrypted, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  }
}
