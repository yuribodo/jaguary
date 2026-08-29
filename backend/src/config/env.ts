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
}).superRefine((value, context) => {
  if (!value.YUNO_ENABLED) return;

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

export type Env = Omit<ParsedEnv, `YUNO_${string}`> & { yuno: YunoConfig };

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
    ...environment
  } = result.data;
  if (!YUNO_ENABLED) return { ...environment, yuno: { enabled: false } };

  return {
    ...environment,
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
