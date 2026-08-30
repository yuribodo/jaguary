import { z } from "zod";

const databaseUrlSchema = z.string().superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (
      (url.protocol !== "postgres:" && url.protocol !== "postgresql:")
      || url.hostname.length === 0
      || url.pathname === "/"
    ) {
      throw new TypeError("invalid PostgreSQL URL");
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "must be a PostgreSQL URL with a host and database name",
    });
  }
});

const yunoSandboxBaseUrlSchema = z.string().superRefine((value, context) => {
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:"
      || url.hostname !== "api-sandbox.y.uno"
      || url.port !== ""
      || url.username !== ""
      || url.password !== ""
      || (url.pathname !== "" && url.pathname !== "/")
      || url.search !== ""
      || url.hash !== ""
    ) {
      throw new TypeError("not the Yuno sandbox origin");
    }
  } catch {
    context.addIssue({
      code: "custom",
      message: "must be the official HTTPS Yuno sandbox base URL",
    });
  }
});

const yunoSecretSchema = z.string()
  .min(1)
  .max(4096)
  .refine((value) => value === value.trim(), "must not have surrounding whitespace");

const openAIModelSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "must be a safe model identifier");

const safeIdentifierSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/).max(128);
const privateJwkSchema = z.string().superRefine((value, context) => {
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.kty !== "EC" || parsed.crv !== "P-256" || typeof parsed.d !== "string") throw new Error();
  } catch {
    context.addIssue({ code: "custom", message: "must be an ES256 private JWK JSON object" });
  }
});
const encryptionKeySchema = z.string().refine(
  (value) => Buffer.from(value, "base64").byteLength === 32,
  "must be a base64-encoded 32-byte key",
);
const httpsUrlSchema = z.url().refine((value) => new URL(value).protocol === "https:", "must use HTTPS");

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  CORS_ORIGIN: z.url().default("http://localhost:3000"),
  DATABASE_URL: databaseUrlSchema,
  YUNO_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  YUNO_BASE_URL: yunoSandboxBaseUrlSchema.optional(),
  YUNO_ACCOUNT_ID: z.uuid().optional(),
  YUNO_PUBLIC_API_KEY: yunoSecretSchema.optional(),
  YUNO_PRIVATE_SECRET_KEY: yunoSecretSchema.optional(),
  YUNO_COUNTRY: z.string().regex(/^[A-Z]{2}$/).optional(),
  YUNO_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1).max(59_000).optional(),
  OPENAI_API_KEY: yunoSecretSchema.optional(),
  OPENAI_MODEL: openAIModelSchema.optional(),
  OPENAI_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1).max(59_000).default(20_000),
  TRAVELBOT_AGENT_PRIVATE_JWK: privateJwkSchema.optional(),
  TRAVELBOT_AGENT_KEY_ID: safeIdentifierSchema.optional(),
  TRAVELBOT_AGENT_BUILD_FINGERPRINT: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  TRAVELBOT_DEMO_CREDENTIAL_ID: safeIdentifierSchema.optional(),
  TRAVELBOT_APPROVAL_ENCRYPTION_KEY: encryptionKeySchema.optional(),
  LANGFUSE_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  LANGFUSE_PUBLIC_KEY: yunoSecretSchema.optional(),
  LANGFUSE_SECRET_KEY: yunoSecretSchema.optional(),
  LANGFUSE_BASE_URL: httpsUrlSchema.optional(),
  RELEASE: safeIdentifierSchema.optional(),
}).superRefine((value, context) => {
  if (value.YUNO_ENABLED) {
    const requiredFields = [
      "YUNO_BASE_URL",
      "YUNO_ACCOUNT_ID",
      "YUNO_PUBLIC_API_KEY",
      "YUNO_PRIVATE_SECRET_KEY",
      "YUNO_COUNTRY",
      "YUNO_REQUEST_TIMEOUT_MS",
    ] as const;
    for (const field of requiredFields) {
      if (value[field] === undefined) {
        context.addIssue({
          code: "custom",
          message: "is required when YUNO_ENABLED=true",
          path: [field],
        });
      }
    }
  }
  if (value.OPENAI_API_KEY !== undefined && value.OPENAI_MODEL === undefined) {
    context.addIssue({ code: "custom", message: "is required when OPENAI_API_KEY is set", path: ["OPENAI_MODEL"] });
  }
  if (value.OPENAI_MODEL !== undefined && value.OPENAI_API_KEY === undefined) {
    context.addIssue({ code: "custom", message: "is required when OPENAI_MODEL is set", path: ["OPENAI_API_KEY"] });
  }
  if (value.OPENAI_API_KEY !== undefined) {
    for (const field of [
      "TRAVELBOT_AGENT_PRIVATE_JWK",
      "TRAVELBOT_AGENT_KEY_ID",
      "TRAVELBOT_AGENT_BUILD_FINGERPRINT",
      "TRAVELBOT_DEMO_CREDENTIAL_ID",
      "TRAVELBOT_APPROVAL_ENCRYPTION_KEY",
    ] as const) {
      if (value[field] === undefined) {
        context.addIssue({ code: "custom", message: "is required when OpenAI chat is enabled", path: [field] });
      }
    }
  }
  if (value.LANGFUSE_ENABLED) {
    for (const field of ["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_BASE_URL"] as const) {
      if (value[field] === undefined) {
        context.addIssue({ code: "custom", message: "is required when LANGFUSE_ENABLED=true", path: [field] });
      }
    }
  }
});

type ParsedEnv = z.infer<typeof envSchema>;

export interface DisabledYunoConfig {
  enabled: false;
}

export interface EnabledYunoConfig {
  enabled: true;
  baseUrl: string;
  accountId: string;
  publicApiKey: string;
  privateSecretKey: string;
  country: string;
  requestTimeoutMs: number;
}

export type YunoConfig = DisabledYunoConfig | EnabledYunoConfig;

export type OpenAIConfig = { enabled: false } | {
  enabled: true;
  apiKey: string;
  model: string;
  requestTimeoutMs: number;
};

export type TravelBotRuntimeConfig = { enabled: false } | {
  enabled: true;
  privateJwk: Record<string, unknown>;
  keyId: string;
  buildFingerprint: string;
  credentialId: string;
  approvalEncryptionKey: string;
};

export type LangfuseConfig = { enabled: false } | {
  enabled: true;
  publicKey: string;
  secretKey: string;
  baseUrl: string;
};

export type Env = Omit<ParsedEnv, `YUNO_${string}` | `OPENAI_${string}` | `TRAVELBOT_${string}` | `LANGFUSE_${string}`> & {
  yuno: YunoConfig;
  openai: OpenAIConfig;
  travelbot: TravelBotRuntimeConfig;
  langfuse: LangfuseConfig;
};

export class ConfigurationError extends Error {
  constructor(issues: z.core.$ZodIssue[]) {
    const details = issues
      .map((issue) => `${issue.path.join(".") || "environment"}: ${issue.message}`)
      .join("; ");
    super(`Invalid environment configuration: ${details}`);
    this.name = "ConfigurationError";
  }
}

export function loadEnv(input: NodeJS.ProcessEnv = process.env): Env {
  const result = envSchema.safeParse(input);
  if (!result.success) {
    throw new ConfigurationError(result.error.issues);
  }
  const {
    YUNO_ENABLED,
    YUNO_BASE_URL,
    YUNO_ACCOUNT_ID,
    YUNO_PUBLIC_API_KEY,
    YUNO_PRIVATE_SECRET_KEY,
    YUNO_COUNTRY,
    YUNO_REQUEST_TIMEOUT_MS,
    OPENAI_API_KEY,
    OPENAI_MODEL,
    OPENAI_REQUEST_TIMEOUT_MS,
    TRAVELBOT_AGENT_PRIVATE_JWK,
    TRAVELBOT_AGENT_KEY_ID,
    TRAVELBOT_AGENT_BUILD_FINGERPRINT,
    TRAVELBOT_DEMO_CREDENTIAL_ID,
    TRAVELBOT_APPROVAL_ENCRYPTION_KEY,
    LANGFUSE_ENABLED,
    LANGFUSE_PUBLIC_KEY,
    LANGFUSE_SECRET_KEY,
    LANGFUSE_BASE_URL,
    ...environment
  } = result.data;
  const openai: OpenAIConfig = OPENAI_API_KEY === undefined || OPENAI_MODEL === undefined
    ? { enabled: false }
    : {
      enabled: true,
      apiKey: OPENAI_API_KEY,
      model: OPENAI_MODEL,
      requestTimeoutMs: OPENAI_REQUEST_TIMEOUT_MS,
    };
  const travelbot: TravelBotRuntimeConfig = !openai.enabled
    ? { enabled: false }
    : {
      enabled: true,
      privateJwk: JSON.parse(TRAVELBOT_AGENT_PRIVATE_JWK!) as Record<string, unknown>,
      keyId: TRAVELBOT_AGENT_KEY_ID!,
      buildFingerprint: TRAVELBOT_AGENT_BUILD_FINGERPRINT!,
      credentialId: TRAVELBOT_DEMO_CREDENTIAL_ID!,
      approvalEncryptionKey: TRAVELBOT_APPROVAL_ENCRYPTION_KEY!,
    };
  const langfuse: LangfuseConfig = !LANGFUSE_ENABLED
    ? { enabled: false }
    : {
      enabled: true,
      publicKey: LANGFUSE_PUBLIC_KEY!,
      secretKey: LANGFUSE_SECRET_KEY!,
      baseUrl: LANGFUSE_BASE_URL!.replace(/\/$/, ""),
    };
  if (!YUNO_ENABLED) return { ...environment, yuno: { enabled: false }, openai, travelbot, langfuse };

  return {
    ...environment,
    openai,
    travelbot,
    langfuse,
    yuno: {
      enabled: true,
      baseUrl: YUNO_BASE_URL!.replace(/\/$/, ""),
      accountId: YUNO_ACCOUNT_ID!,
      publicApiKey: YUNO_PUBLIC_API_KEY!,
      privateSecretKey: YUNO_PRIVATE_SECRET_KEY!,
      country: YUNO_COUNTRY!,
      requestTimeoutMs: YUNO_REQUEST_TIMEOUT_MS!,
    },
  };
}
