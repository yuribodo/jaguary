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
const secretSchema = z.string().min(1).max(4096).refine((value) => value === value.trim(), "must not have surrounding whitespace");
const diditBaseUrlSchema = z.url().superRefine((value, context) => {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.hostname !== "verification.didit.me" || url.port !== ""
    || !["", "/"].includes(url.pathname) || url.search !== "" || url.hash !== "") {
    context.addIssue({ code: "custom", message: "must be the official HTTPS Didit API origin" });
  }
});

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
  AUTH_MODE: z.enum(["demo", "oidc"]).default("demo"),
  AUTH_SESSION_TTL_SECONDS: z.coerce.number().int().min(300).max(604_800).default(28_800),
  AUTH_LOGIN_TRANSACTION_TTL_SECONDS: z.coerce.number().int().min(60).max(3_600).default(600),
  AUTH_OIDC_ISSUER: z.url().optional(),
  AUTH_OIDC_CLIENT_ID: secretSchema.optional(),
  AUTH_OIDC_CLIENT_SECRET: secretSchema.optional(),
  AUTH_OIDC_CALLBACK_URL: z.url().optional(),
  KYA_MODE: z.enum(["LOCAL", "EXTERNAL_OPTIONAL", "EXTERNAL_REQUIRED"]).default("LOCAL"),
  KYA_PROVIDER: z.enum(["fake", "didit"]).default("fake"),
  KYA_API_BASE_URL: diditBaseUrlSchema.optional(),
  KYA_API_KEY: secretSchema.optional(),
  KYA_WORKFLOW_ID: z.uuid().optional(),
  KYA_BIOMETRIC_WORKFLOW_ID: z.uuid().optional(),
  KYA_WEBHOOK_SECRET: secretSchema.optional(),
  KYA_REQUEST_TIMEOUT_MS: z.coerce.number().int().min(250).max(30_000).default(5_000),
  KYA_ATTESTATION_TTL_SECONDS: z.coerce.number().int().min(60).max(63_072_000).default(31_536_000),
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
  SERPAPI_API_KEY: yunoSecretSchema.optional(),
  FLIGHT_SEARCH_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(59_000).default(15_000),
  GOOGLE_FLIGHTS_DEEP_SEARCH: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
}).superRefine((value, context) => {
  if (value.NODE_ENV !== "development" && value.AUTH_MODE === "demo") {
    context.addIssue({ code: "custom", message: "demo authentication is available only in development", path: ["AUTH_MODE"] });
  }
  if (value.AUTH_MODE === "oidc") {
    for (const field of ["AUTH_OIDC_ISSUER", "AUTH_OIDC_CLIENT_ID", "AUTH_OIDC_CLIENT_SECRET", "AUTH_OIDC_CALLBACK_URL"] as const) {
      if (value[field] === undefined) context.addIssue({ code: "custom", message: "is required when AUTH_MODE=oidc", path: [field] });
    }
    if (value.NODE_ENV === "production") {
      for (const field of ["AUTH_OIDC_ISSUER", "AUTH_OIDC_CALLBACK_URL"] as const) {
        const configured = value[field];
        if (configured !== undefined && new URL(configured).protocol !== "https:") {
          context.addIssue({ code: "custom", message: "must use HTTPS in production", path: [field] });
        }
      }
    }
  }
  if (value.KYA_MODE !== "LOCAL") {
    if (value.KYA_PROVIDER !== "didit") context.addIssue({ code: "custom", message: "external KYA requires the didit provider", path: ["KYA_PROVIDER"] });
    for (const field of ["KYA_API_BASE_URL", "KYA_API_KEY", "KYA_WORKFLOW_ID", "KYA_WEBHOOK_SECRET"] as const) {
      if (value[field] === undefined) context.addIssue({ code: "custom", message: "is required for external KYA", path: [field] });
    }
  }
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

export type FlightSearchConfig = { enabled: false } | {
  enabled: true;
  apiKey: string;
  timeoutMs: number;
  deepSearch: boolean;
};

export type AuthConfig = { mode: "demo"; sessionTtlSeconds: number; loginTransactionTtlSeconds: number } | {
  mode: "oidc";
  sessionTtlSeconds: number;
  loginTransactionTtlSeconds: number;
  issuer: string;
  clientId: string;
  clientSecret: string;
  callbackUrl: string;
};
export type KyaConfig = {
  mode: "LOCAL" | "EXTERNAL_OPTIONAL" | "EXTERNAL_REQUIRED";
  provider: "fake" | "didit";
  requestTimeoutMs: number;
  attestationTtlSeconds: number;
  baseUrl?: string;
  apiKey?: string;
  workflowId?: string;
  biometricWorkflowId?: string;
  webhookSecret?: string;
};

export type Env = Omit<ParsedEnv, `YUNO_${string}` | `OPENAI_${string}` | `TRAVELBOT_${string}` | `LANGFUSE_${string}` | `AUTH_${string}` | `KYA_${string}` | "SERPAPI_API_KEY" | "FLIGHT_SEARCH_TIMEOUT_MS" | "GOOGLE_FLIGHTS_DEEP_SEARCH"> & {
  yuno: YunoConfig;
  openai: OpenAIConfig;
  travelbot: TravelBotRuntimeConfig;
  langfuse: LangfuseConfig;
  flightSearch: FlightSearchConfig;
  auth: AuthConfig;
  kya: KyaConfig;
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
    SERPAPI_API_KEY,
    FLIGHT_SEARCH_TIMEOUT_MS,
    GOOGLE_FLIGHTS_DEEP_SEARCH,
    AUTH_MODE,
    AUTH_SESSION_TTL_SECONDS,
    AUTH_LOGIN_TRANSACTION_TTL_SECONDS,
    AUTH_OIDC_ISSUER,
    AUTH_OIDC_CLIENT_ID,
    AUTH_OIDC_CLIENT_SECRET,
    AUTH_OIDC_CALLBACK_URL,
    KYA_MODE,
    KYA_PROVIDER,
    KYA_API_BASE_URL,
    KYA_API_KEY,
    KYA_WORKFLOW_ID,
    KYA_BIOMETRIC_WORKFLOW_ID,
    KYA_WEBHOOK_SECRET,
    KYA_REQUEST_TIMEOUT_MS,
    KYA_ATTESTATION_TTL_SECONDS,
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
  const flightSearch: FlightSearchConfig = SERPAPI_API_KEY === undefined
    ? { enabled: false }
    : {
      enabled: true,
      apiKey: SERPAPI_API_KEY,
      timeoutMs: FLIGHT_SEARCH_TIMEOUT_MS,
      deepSearch: GOOGLE_FLIGHTS_DEEP_SEARCH,
    };
  const auth: AuthConfig = AUTH_MODE === "demo" ? {
    mode: "demo", sessionTtlSeconds: AUTH_SESSION_TTL_SECONDS, loginTransactionTtlSeconds: AUTH_LOGIN_TRANSACTION_TTL_SECONDS,
  } : {
    mode: "oidc", sessionTtlSeconds: AUTH_SESSION_TTL_SECONDS, loginTransactionTtlSeconds: AUTH_LOGIN_TRANSACTION_TTL_SECONDS,
    issuer: AUTH_OIDC_ISSUER!, clientId: AUTH_OIDC_CLIENT_ID!, clientSecret: AUTH_OIDC_CLIENT_SECRET!, callbackUrl: AUTH_OIDC_CALLBACK_URL!,
  };
  const kya: KyaConfig = {
    mode: KYA_MODE, provider: KYA_PROVIDER, requestTimeoutMs: KYA_REQUEST_TIMEOUT_MS,
    attestationTtlSeconds: KYA_ATTESTATION_TTL_SECONDS,
    ...(KYA_API_BASE_URL === undefined ? {} : { baseUrl: KYA_API_BASE_URL.replace(/\/$/, "") }),
    ...(KYA_API_KEY === undefined ? {} : { apiKey: KYA_API_KEY }),
    ...(KYA_WORKFLOW_ID === undefined ? {} : { workflowId: KYA_WORKFLOW_ID }),
    ...(KYA_BIOMETRIC_WORKFLOW_ID === undefined ? {} : { biometricWorkflowId: KYA_BIOMETRIC_WORKFLOW_ID }),
    ...(KYA_WEBHOOK_SECRET === undefined ? {} : { webhookSecret: KYA_WEBHOOK_SECRET }),
  };
  if (!YUNO_ENABLED) return { ...environment, yuno: { enabled: false }, openai, travelbot, langfuse, flightSearch, auth, kya };

  return {
    ...environment,
    openai,
    travelbot,
    langfuse,
    flightSearch,
    auth,
    kya,
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
