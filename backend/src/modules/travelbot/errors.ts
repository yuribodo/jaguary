export class AgentRuntimeInvalidOutputError extends Error {
  constructor() {
    super("Agent runtime returned invalid structured output");
    this.name = "AgentRuntimeInvalidOutputError";
  }
}

export class AgentRuntimeUnavailableError extends Error {
  readonly retryable = true;

  constructor(public readonly code: "timeout" | "rate_limit" | "unavailable" = "unavailable") {
    super("TravelBot model service is temporarily unavailable");
    this.name = "AgentRuntimeUnavailableError";
  }
}

export class UnavailableAgentRuntime {
  async run(): Promise<never> {
    throw new AgentRuntimeUnavailableError("unavailable");
  }
}
