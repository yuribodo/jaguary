export interface LlmTelemetryEvent {
  name: string;
  conversation_id: string;
  run_id?: string;
  correlation_id?: string;
  model?: string;
  state?: string;
  tool_name?: string;
  status?: string;
  reason_code?: string;
  missing_fields?: string[];
  input_tokens?: number;
  output_tokens?: number;
  latency_ms?: number;
}

export interface LlmTelemetryPort {
  emit(event: LlmTelemetryEvent): void | Promise<void>;
}

export class NoopLlmTelemetry implements LlmTelemetryPort {
  emit(): void {}
}

export function emitBestEffort(telemetry: LlmTelemetryPort, event: LlmTelemetryEvent): void {
  try {
    void Promise.resolve(telemetry.emit(event)).catch(() => undefined);
  } catch {
    // Telemetry must never affect chat or payment behavior.
  }
}
