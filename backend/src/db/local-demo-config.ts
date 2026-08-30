import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  randomBytes,
  type JsonWebKey,
} from "node:crypto";

import { parse } from "dotenv";

import {
  canonicalizeJson,
  es256PublicJwkSchema,
  type Es256PublicJwk,
} from "../contracts/v1/index.js";

const LOCAL_TRAVELBOT_FIELDS = [
  "TRAVELBOT_AGENT_PRIVATE_JWK",
  "TRAVELBOT_AGENT_KEY_ID",
  "TRAVELBOT_AGENT_BUILD_FINGERPRINT",
  "TRAVELBOT_DEMO_CREDENTIAL_ID",
  "TRAVELBOT_APPROVAL_ENCRYPTION_KEY",
] as const;

type LocalTravelBotField = (typeof LOCAL_TRAVELBOT_FIELDS)[number];

export type LocalTravelBotMaterial = Record<LocalTravelBotField, string> & {
  publicJwk: Es256PublicJwk;
};

export class LocalDemoConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LocalDemoConfigurationError";
  }
}

function publicJwkFor(privateJwkValue: string): Es256PublicJwk {
  try {
    const privateJwk = JSON.parse(privateJwkValue) as JsonWebKey;
    if (typeof privateJwk.d !== "string") throw new Error("private coordinate is absent");
    const publicJwk = createPublicKey(createPrivateKey({ key: privateJwk, format: "jwk" }))
      .export({ format: "jwk" });
    return es256PublicJwkSchema.parse({
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      y: publicJwk.y,
    });
  } catch {
    throw new LocalDemoConfigurationError(
      "TRAVELBOT_AGENT_PRIVATE_JWK must be a valid private P-256 JWK",
    );
  }
}

function validateMaterial(values: Record<LocalTravelBotField, string>): LocalTravelBotMaterial {
  const keyId = values.TRAVELBOT_AGENT_KEY_ID;
  const credentialId = values.TRAVELBOT_DEMO_CREDENTIAL_ID;
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(keyId) || keyId.length > 128) {
    throw new LocalDemoConfigurationError("TRAVELBOT_AGENT_KEY_ID is invalid");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(credentialId) || credentialId.length > 128) {
    throw new LocalDemoConfigurationError("TRAVELBOT_DEMO_CREDENTIAL_ID is invalid");
  }
  if (!/^[a-f0-9]{64}$/.test(values.TRAVELBOT_AGENT_BUILD_FINGERPRINT)) {
    throw new LocalDemoConfigurationError("TRAVELBOT_AGENT_BUILD_FINGERPRINT must be a SHA-256 hash");
  }
  if (Buffer.from(values.TRAVELBOT_APPROVAL_ENCRYPTION_KEY, "base64").byteLength !== 32) {
    throw new LocalDemoConfigurationError(
      "TRAVELBOT_APPROVAL_ENCRYPTION_KEY must encode exactly 32 bytes",
    );
  }
  return {
    ...values,
    publicJwk: publicJwkFor(values.TRAVELBOT_AGENT_PRIVATE_JWK),
  };
}

export function generateLocalTravelBotMaterial(): LocalTravelBotMaterial {
  const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
  const exported = privateKey.export({ format: "jwk" });
  const privateJwk = JSON.stringify({
    kty: exported.kty,
    crv: exported.crv,
    x: exported.x,
    y: exported.y,
    d: exported.d,
  });
  const publicJwk = publicJwkFor(privateJwk);
  const keyId = "key_local_travelbot_2026";
  const buildFingerprint = createHash("sha256")
    .update(canonicalizeJson({ key_id: keyId, public_jwk: publicJwk }))
    .digest("hex");
  return validateMaterial({
    TRAVELBOT_AGENT_PRIVATE_JWK: privateJwk,
    TRAVELBOT_AGENT_KEY_ID: keyId,
    TRAVELBOT_AGENT_BUILD_FINGERPRINT: buildFingerprint,
    TRAVELBOT_DEMO_CREDENTIAL_ID: "cred_local_travelbot_template",
    TRAVELBOT_APPROVAL_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
  });
}

export function configureLocalTravelBotEnvironment(source: string): {
  content: string;
  generated: boolean;
  material: LocalTravelBotMaterial;
} {
  const environment = parse(source);
  const configuredFields = LOCAL_TRAVELBOT_FIELDS.filter((field) => {
    return environment[field]?.trim().length;
  });
  if (configuredFields.length > 0 && configuredFields.length < LOCAL_TRAVELBOT_FIELDS.length) {
    const missing = LOCAL_TRAVELBOT_FIELDS.filter((field) => !configuredFields.includes(field));
    throw new LocalDemoConfigurationError(
      `Local TravelBot configuration is partial; complete or remove: ${missing.join(", ")}`,
    );
  }
  if (configuredFields.length === LOCAL_TRAVELBOT_FIELDS.length) {
    const values = Object.fromEntries(
      LOCAL_TRAVELBOT_FIELDS.map((field) => [field, environment[field]!]),
    ) as Record<LocalTravelBotField, string>;
    return { content: source, generated: false, material: validateMaterial(values) };
  }

  const material = generateLocalTravelBotMaterial();
  const separator = source.length === 0 || source.endsWith("\n") ? "" : "\n";
  const block = [
    "",
    "# Generated local-only TravelBot material. Never copy these values to production.",
    ...LOCAL_TRAVELBOT_FIELDS.map((field) => `${field}=${material[field]}`),
    "",
  ].join("\n");
  return { content: `${source}${separator}${block}`, generated: true, material };
}
