import {
  generateKeyPairSync,
  sign as signBytes,
  verify as verifyBytes,
  type KeyObject,
} from "node:crypto";

import {
  type Signature,
  type SignatureAlgorithm,
  type SignerPort,
} from "../../contracts/v1/index.js";

const KEY_ID = "key_vuelaya_ephemeral_es256";

/** Runtime-only ES256 adapter. Key material is generated on startup and never exported. */
export class EphemeralEs256Signer implements SignerPort {
  readonly #privateKey: KeyObject;
  readonly #publicKey: KeyObject;

  constructor() {
    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.#privateKey = pair.privateKey;
    this.#publicKey = pair.publicKey;
  }

  async sign(payload: Uint8Array, algorithm: SignatureAlgorithm = "ES256"): Promise<Signature> {
    if (algorithm !== "ES256") throw new TypeError("VuelaYa signer supports ES256 only");
    return {
      algorithm,
      key_id: KEY_ID,
      value: signBytes("sha256", payload, this.#privateKey).toString("base64url"),
    };
  }

  async verify(payload: Uint8Array, signature: Signature): Promise<boolean> {
    if (signature.algorithm !== "ES256" || signature.key_id !== KEY_ID) return false;
    return verifyBytes(
      "sha256",
      payload,
      this.#publicKey,
      Buffer.from(signature.value, "base64url"),
    );
  }
}
