import type { ClockPort } from "../../contracts/v1/index.js";
import type {
  AgentToolExecutionResult,
  AgentToolExecutorPort,
  TravelBotRepositoryPort,
  TravelBotToolName,
  TravelBotToolsPort,
} from "./types.js";

function allowed(state: string, name: TravelBotToolName): boolean {
  return (
    (state === "READY_TO_SEARCH" && name === "find_offers")
    || (state === "AWAITING_OFFER_SELECTION" && name === "create_checkout")
    || (state === "AWAITING_AUTHORITY_CONFIRMATION" && name === "request_purchase")
    || (state === "READY_TO_PURCHASE" && name === "request_purchase")
    || (state === "COMPLETED" && (name === "get_receipt" || name === "get_audit_timeline"))
  );
}

export class StateGuardedAgentToolExecutor implements AgentToolExecutorPort {
  constructor(
    private readonly repository: TravelBotRepositoryPort,
    private readonly tools: TravelBotToolsPort,
    private readonly clock: ClockPort,
  ) {}

  async execute(input: Parameters<AgentToolExecutorPort["execute"]>[0]): Promise<AgentToolExecutionResult> {
    const conversation = await this.repository.get(input.conversation_id);
    let result: AgentToolExecutionResult;
    if (conversation === undefined || !allowed(conversation.state, input.tool_name)) {
      result = { status: "REJECTED", reference_id: null, reason_code: "tool_unavailable_in_state" };
    } else {
      try {
        switch (input.tool_name) {
          case "find_offers": {
            const offers = await this.tools.findOffers(conversation.intent);
            result = { status: "OK", reference_id: offers[0]?.offer_id ?? null, reason_code: null };
            break;
          }
          case "get_receipt": {
            if (this.tools.getReceipt === undefined) throw new Error("tool_not_configured");
            const receipt = await this.tools.getReceipt(conversation);
            result = { status: "OK", reference_id: receipt.receipt_id, reason_code: null };
            break;
          }
          case "get_audit_timeline": {
            if (this.tools.getAuditTimeline === undefined) throw new Error("tool_not_configured");
            const timeline = await this.tools.getAuditTimeline(conversation);
            result = { status: "OK", reference_id: timeline.correlation_id, reason_code: null };
            break;
          }
          default:
            // Mutation tools are committed only by TravelBotService after merging
            // the current structured proposal/confirmation. The SDK call is a
            // proposal and cannot independently create authority or payment.
            result = { status: "REJECTED", reference_id: null, reason_code: "application_commit_required" };
        }
      } catch {
        result = { status: "FAILED", reference_id: null, reason_code: "tool_failure" };
      }
    }
    await this.repository.recordToolExecutions?.(input.run_id, [{
      tool_call_id: input.tool_call_id,
      tool_name: input.tool_name,
      status: result.status === "OK" ? "COMPLETED" : result.status,
      arguments: input.arguments,
      result: {
        status: result.status,
        reference_id: result.reference_id,
        reason_code: result.reason_code,
      },
      ...(result.reason_code === null ? {} : { error_code: result.reason_code }),
    }], this.clock.now());
    return result;
  }
}
