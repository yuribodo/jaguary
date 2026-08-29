import { z } from "zod";

import { reasonCodeSchema } from "../authorization/schemas.js";
import { correlationIdSchema } from "../common/primitives.js";

export const transportErrorCodeSchema = z.enum([
  "invalid_request",
  "validation_error",
  "not_found",
  "missing_idempotency_key",
  "invalid_idempotency_key",
  "idempotency_conflict",
  "internal_error",
]);

export const apiErrorCodeSchema = z.union([reasonCodeSchema, transportErrorCodeSchema]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorEnvelopeSchema = z
  .object({
    error: z
      .object({
        code: apiErrorCodeSchema,
        message: z.string().min(1).max(512),
        details: z.record(z.string(), z.unknown()),
      })
      .strict(),
    correlation_id: correlationIdSchema,
  })
  .strict();

export type ApiErrorEnvelope = z.infer<typeof apiErrorEnvelopeSchema>;

export class PublicApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "PublicApiError";
  }
}
