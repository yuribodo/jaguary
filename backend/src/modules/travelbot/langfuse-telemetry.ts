import { LangfuseSpanProcessor } from "@langfuse/otel";
import { startObservation } from "@langfuse/tracing";
import { NodeSDK } from "@opentelemetry/sdk-node";

import type { LlmTelemetryEvent, LlmTelemetryPort } from "./telemetry.js";

export interface LangfuseTelemetryOptions {
  publicKey: string;
  secretKey: string;
  baseUrl: string;
  environment: string;
  release?: string;
}

export class LangfuseTelemetryAdapter implements LlmTelemetryPort {
  readonly #processor: LangfuseSpanProcessor;
  readonly #sdk: NodeSDK;

  constructor(options: LangfuseTelemetryOptions) {
    this.#processor = new LangfuseSpanProcessor({
      publicKey: options.publicKey,
      secretKey: options.secretKey,
      baseUrl: options.baseUrl,
      environment: options.environment,
      ...(options.release === undefined ? {} : { release: options.release }),
      timeout: 2,
      mask: ({ data }) => data === undefined ? data : "[REDACTED]",
    });
    this.#sdk = new NodeSDK({ spanProcessors: [this.#processor] });
    this.#sdk.start();
  }

  emit(event: LlmTelemetryEvent): void {
    const observation = startObservation(`travelbot.${event.name}`, {
      metadata: { ...event },
    }, { asType: "event" });
    observation.end();
  }

  async shutdown(): Promise<void> {
    try {
      await this.#processor.forceFlush();
    } catch {
      // Best effort by contract.
    }
    try {
      await this.#sdk.shutdown();
    } catch {
      // Best effort by contract.
    }
  }
}
