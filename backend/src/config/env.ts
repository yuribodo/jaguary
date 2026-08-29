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
});

export type Env = z.infer<typeof envSchema>;

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
  return result.data;
}
