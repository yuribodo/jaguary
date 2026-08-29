import { randomUUID } from "node:crypto";
import type { IncomingMessage } from "node:http";

import type { FastifyInstance } from "fastify";

import {
  correlationIdSchema,
  idempotencyKeySchema,
  PublicApiError,
  type ApiErrorEnvelope,
} from "../contracts/v1/index.js";

const MUTABLE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function generateCorrelationId(request: IncomingMessage): string {
  const candidate = request.headers["x-correlation-id"];
  if (typeof candidate === "string" && correlationIdSchema.safeParse(candidate).success) {
    return candidate;
  }
  return randomUUID();
}

export function configureHttpConventions(app: FastifyInstance): void {
  app.addHook("onRequest", async (request) => {
    if (!MUTABLE_METHODS.has(request.method)) return;

    const idempotencyKey = request.headers["idempotency-key"];
    if (idempotencyKey === undefined) {
      throw new PublicApiError(
        400,
        "missing_idempotency_key",
        "Idempotency-Key is required for mutable requests",
      );
    }
    if (typeof idempotencyKey !== "string" || !idempotencyKeySchema.safeParse(idempotencyKey).success) {
      throw new PublicApiError(
        400,
        "invalid_idempotency_key",
        "Idempotency-Key must be 8-128 safe ASCII characters",
      );
    }
  });

  app.addHook("onSend", async (request, reply) => {
    void reply.header("x-correlation-id", request.id);
  });

  app.setNotFoundHandler((request, reply) => {
    const envelope: ApiErrorEnvelope = {
      error: {
        code: "not_found",
        message: "Route not found",
        details: {},
      },
      correlation_id: request.id,
    };
    void reply.status(404).send(envelope);
  });

  app.setErrorHandler((error, request, reply) => {
    let statusCode = 500;
    let publicError = new PublicApiError(500, "internal_error", "Internal server error");
    const fastifyError = error as { validation?: unknown; statusCode?: number };

    if (error instanceof PublicApiError) {
      statusCode = error.statusCode;
      publicError = error;
    } else if (fastifyError.validation !== undefined) {
      statusCode = 400;
      publicError = new PublicApiError(400, "validation_error", "Request validation failed");
    } else if (fastifyError.statusCode !== undefined && fastifyError.statusCode < 500) {
      statusCode = fastifyError.statusCode;
      publicError = new PublicApiError(statusCode, "invalid_request", "Invalid request");
    } else {
      request.log.error(
        { correlation_id: request.id, error_name: error instanceof Error ? error.name : "UnknownError" },
        "Unhandled request error",
      );
    }

    const envelope: ApiErrorEnvelope = {
      error: {
        code: publicError.code,
        message: publicError.message,
        details: publicError.details,
      },
      correlation_id: request.id,
    };
    void reply.status(statusCode).send(envelope);
  });
}
