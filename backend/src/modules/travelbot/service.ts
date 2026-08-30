import { randomUUID } from "node:crypto";

import { PublicApiError } from "../../contracts/v1/index.js";
import { AgentRuntimeInvalidOutputError, AgentRuntimeUnavailableError } from "./errors.js";
import {
  applyConversationConventions,
  applyTravelIntentProposal,
  deterministicClarification,
  missingTravelIntentFields,
} from "./policy.js";
import type {
  AgentRuntimePort,
  CompletedTravelToolExecution,
  CreateConversationCommand,
  PostMessageCommand,
  TravelBotConversation,
  TravelBotConversationView,
  TravelBotRepositoryPort,
  TravelBotOperationState,
  TravelBotToolName,
  TravelBotToolsPort,
} from "./types.js";
import type { ClockPort } from "../../contracts/v1/index.js";
import type { ApprovalStateProtectorPort } from "./approval-state.js";
import { emitBestEffort, NoopLlmTelemetry, type LlmTelemetryPort } from "./telemetry.js";

export interface TravelBotServiceOptions {
  repository: TravelBotRepositoryPort;
  runtime: AgentRuntimePort;
  tools: TravelBotToolsPort;
  clock: ClockPort;
  model?: string;
  approvalStateProtector?: ApprovalStateProtectorPort;
  telemetry?: LlmTelemetryPort;
}

function view(conversation: TravelBotConversation): TravelBotConversationView {
  const cloned = structuredClone(conversation);
  const pending = cloned.operation.pending_approval;
  return {
    ...cloned,
    operation: {
      ...cloned.operation,
      pending_approval: pending === null ? null : {
        approval_id: pending.approval_id,
        merchant_id: pending.merchant_id,
        checkout_hash: pending.checkout_hash,
        amount: pending.amount,
        currency: pending.currency,
        mandate_id: pending.mandate_id,
        status: pending.status,
      },
    },
    missing_fields: missingTravelIntentFields(conversation.intent),
  };
}

function emptyOperation(): TravelBotOperationState {
  return {
    checkout_id: null,
    checkout_hash: null,
    mandate_id: null,
    authorization_id: null,
    receipt_id: null,
    pending_approval: null,
  };
}

function legalTools(state: TravelBotConversation["state"]): TravelBotToolName[] {
  switch (state) {
    case "READY_TO_SEARCH": return ["find_offers"];
    case "AWAITING_OFFER_SELECTION": return ["create_checkout"];
    case "COMPLETED": return ["get_receipt", "get_audit_timeline"];
    default: return [];
  }
}

export class TravelBotService {
  constructor(private readonly options: TravelBotServiceOptions) {}

  async createConversation(command: CreateConversationCommand): Promise<TravelBotConversationView> {
    return view(await this.options.repository.create(command, this.options.clock.now()));
  }

  async getConversation(conversationId: string): Promise<TravelBotConversationView> {
    const conversation = await this.options.repository.get(conversationId);
    if (conversation === undefined) throw new PublicApiError(404, "not_found", "Conversation not found");
    return view(conversation);
  }

  async postMessage(command: PostMessageCommand): Promise<TravelBotConversationView> {
    const claimed = await this.options.repository.claimTurn(command, this.options.clock.now());
    if (claimed.kind === "REPLAY") return view(claimed.conversation);
    const { run_id: runId, conversation } = claimed.claim;
    const recentConversationText = [
      ...conversation.messages.slice(-10).map(({ content }) => content),
      command.content,
    ];
    const telemetry = this.options.telemetry ?? new NoopLlmTelemetry();
    emitBestEffort(telemetry, {
      name: "turn.started",
      conversation_id: conversation.conversation_id,
      run_id: runId,
      correlation_id: command.correlation_id,
      model: this.options.model,
      state: conversation.state,
    });
    const toolExecutions: CompletedTravelToolExecution[] = [];
    const executeTool = async <T>(
      name: TravelBotToolName,
      args: Record<string, unknown>,
      action: () => Promise<T>,
      safeResult: (result: T) => Record<string, unknown>,
    ): Promise<T> => {
      try {
        const result = await action();
        toolExecutions.push({
          tool_call_id: `${name}_${runId}`,
          tool_name: name,
          status: "COMPLETED",
          arguments: args,
          result: safeResult(result),
        });
        return result;
      } catch (error) {
        toolExecutions.push({
          tool_call_id: `${name}_${runId}`,
          tool_name: name,
          status: "FAILED",
          arguments: args,
          error_code: error instanceof PublicApiError ? error.code : "tool_failure",
        });
        throw error;
      }
    };
    try {
      let runtimeResult;
      try {
        runtimeResult = await this.options.runtime.run({
          conversation_id: conversation.conversation_id,
          run_id: runId,
          model: this.options.model ?? "fake-test-model",
          state: conversation.state,
          intent: conversation.intent,
          conversation_history: conversation.messages
            .slice(0, -1)
            .slice(-10)
            .map(({ role, content }) => ({ role, content })),
          user_message: command.content,
          available_tools: legalTools(conversation.state),
        });
      } catch (error) {
        if (!(error instanceof AgentRuntimeInvalidOutputError)) throw error;
        const completed = await this.options.repository.completeTurn(runId, {
          state: conversation.state,
          intent: conversation.intent,
          offers: conversation.offers,
          operation: conversation.operation,
          assistant_message: deterministicClarification(
            missingTravelIntentFields(conversation.intent),
            [],
            recentConversationText,
          ),
        }, this.options.clock.now());
        return view(completed);
      }
      runtimeResult = {
        ...runtimeResult,
        proposal: applyConversationConventions(
          conversation.intent,
          runtimeResult.proposal,
          recentConversationText,
          this.options.clock.now(),
        ),
      };
      const applied = applyTravelIntentProposal(
        conversation.intent,
        runtimeResult.proposal,
        this.options.clock.now(),
      );
      if (conversation.state !== "AWAITING_OFFER_SELECTION") {
        applied.intent.selected_offer_id = conversation.intent.selected_offer_id;
      }
      const missing = missingTravelIntentFields(applied.intent);
      emitBestEffort(telemetry, {
        name: "extraction.validated",
        conversation_id: conversation.conversation_id,
        run_id: runId,
        correlation_id: command.correlation_id,
        model: this.options.model,
        state: conversation.state,
        status: applied.invalid_fields.length === 0 ? "VALID" : "INVALID",
        missing_fields: missing,
      });
      let state: TravelBotConversation["state"] = "COLLECTING";
      let offers = applied.invalidates_downstream ? [] : conversation.offers;
      let operation = applied.invalidates_downstream ? emptyOperation() : conversation.operation;
      let assistantMessage = runtimeResult.assistant_message;

      if (missing.length > 0 || applied.invalid_fields.length > 0) {
        assistantMessage = deterministicClarification(
          missing,
          applied.invalid_fields,
          recentConversationText,
        );
      } else if (conversation.state === "COMPLETED") {
        state = "COMPLETED";
        if (
          runtimeResult.proposal.requested_action === "GET_RECEIPT"
          && this.options.tools.getReceipt !== undefined
        ) {
          const receipt = await executeTool("get_receipt", {}, () => this.options.tools.getReceipt!(conversation), (result) => result);
          assistantMessage = `Receipt ${receipt.receipt_id}: ${receipt.status}, ${receipt.total.currency} ${(receipt.total.amount / 100).toFixed(2)}.`;
        } else if (
          runtimeResult.proposal.requested_action === "GET_AUDIT_TIMELINE"
          && this.options.tools.getAuditTimeline !== undefined
        ) {
          const audit = await executeTool("get_audit_timeline", {}, () => this.options.tools.getAuditTimeline!(conversation), (result) => ({
            correlation_id: result.correlation_id,
            event_count: result.event_count,
            event_types: result.event_types,
          }));
          assistantMessage = `Audit ${audit.correlation_id}: ${audit.event_count} validated events.`;
        } else {
          assistantMessage = `This purchase has already been completed${operation.receipt_id === null ? "." : ` under receipt ${operation.receipt_id}.`}`;
        }
      } else if (
        conversation.state === "AWAITING_AUTHORITY_CONFIRMATION"
        && operation.pending_approval !== null
        && runtimeResult.proposal.explicit_confirmation !== null
      ) {
        const approval = operation.pending_approval;
        if (runtimeResult.proposal.explicit_confirmation === "DENY") {
          if (
            this.options.runtime.resumeApproval !== undefined
            && this.options.approvalStateProtector !== undefined
            && approval.sdk_run_state.startsWith("v1.")
          ) {
            await this.options.runtime.resumeApproval({
              request: {
                conversation_id: conversation.conversation_id,
                run_id: runId,
                model: this.options.model ?? "fake-test-model",
                state: "READY_TO_PURCHASE",
                intent: applied.intent,
                user_message: "Operation denied by the user.",
                available_tools: ["request_purchase"],
              },
              sdk_run_state: await this.options.approvalStateProtector.open(approval.sdk_run_state),
              approved: false,
            });
          }
          applied.intent.confirmation = {
            approval_id: approval.approval_id,
            merchant_id: approval.merchant_id,
            checkout_hash: approval.checkout_hash,
            amount: approval.amount,
            currency: approval.currency,
            mandate_id: approval.mandate_id,
            decision: "DENIED",
            decided_at: this.options.clock.now().toISOString(),
          };
          applied.intent.selected_offer_id = null;
          operation = emptyOperation();
          state = "AWAITING_OFFER_SELECTION";
          assistantMessage = "Operation safely denied. Select an offer again if you would like to continue.";
        } else {
          if (this.options.tools.activateAuthority === undefined || this.options.tools.requestPurchase === undefined) {
            throw new Error("TravelBot purchase tools are not configured");
          }
          applied.intent.confirmation = {
            approval_id: approval.approval_id,
            merchant_id: approval.merchant_id,
            checkout_hash: approval.checkout_hash,
            amount: approval.amount,
            currency: approval.currency,
            mandate_id: approval.mandate_id,
            decision: "CONFIRMED",
            decided_at: this.options.clock.now().toISOString(),
          };
          if (
            this.options.runtime.resumeApproval !== undefined
            && this.options.approvalStateProtector !== undefined
            && approval.sdk_run_state.startsWith("v1.")
          ) {
            await this.options.runtime.resumeApproval({
              request: {
                conversation_id: conversation.conversation_id,
                run_id: runId,
                model: this.options.model ?? "fake-test-model",
                state: "READY_TO_PURCHASE",
                intent: applied.intent,
                user_message: "Bound confirmation validated by the backend.",
                available_tools: ["request_purchase"],
              },
              sdk_run_state: await this.options.approvalStateProtector.open(approval.sdk_run_state),
              approved: true,
            });
          }
          const boundConversation = { ...conversation, intent: applied.intent, operation };
          await executeTool("prepare_authority", { mandate_id: approval.mandate_id }, () => this.options.tools.activateAuthority!({
            conversation: boundConversation,
            mandate_id: approval.mandate_id,
            idempotency_key: `activate_${approval.approval_id}`,
            correlation_id: command.correlation_id,
          }), () => ({ mandate_id: approval.mandate_id, status: "ACTIVE" }));
          state = "READY_TO_PURCHASE";
          const purchase = await executeTool("request_purchase", {
            approval_id: approval.approval_id,
            checkout_hash: approval.checkout_hash,
          }, () => this.options.tools.requestPurchase!({
            conversation: boundConversation,
            idempotency_key: `purchase_${approval.approval_id}`,
            correlation_id: command.correlation_id,
          }), (result) => ({
            status: result.status,
            authorization_id: result.authorization_id ?? null,
            receipt_id: result.receipt_id ?? null,
            reason_code: result.reason_code ?? null,
          }));
          if (purchase.status === "FAILED" && purchase.reason_code === "checkout_stale") {
            applied.intent.selected_offer_id = null;
            applied.intent.confirmation = null;
            operation = emptyOperation();
            state = "AWAITING_OFFER_SELECTION";
            assistantMessage = "The previous checkout became stale before payment. Nothing was charged; review and select the offer again to create a new authorization.";
          } else {
            state = purchase.status === "COMPLETED" ? "COMPLETED" : "FAILED";
            operation = {
              ...operation,
              authorization_id: purchase.authorization_id ?? null,
              receipt_id: purchase.receipt_id ?? null,
              pending_approval: null,
            };
            assistantMessage = purchase.status === "COMPLETED"
              ? `Purchase confirmed. Receipt ${purchase.receipt_id} was saved in Bound.`
              : `The purchase was not completed. No new payment was made (${purchase.reason_code ?? "rejected"}).`;
          }
        }
      } else if (
        conversation.state === "AWAITING_OFFER_SELECTION"
        && runtimeResult.proposal.selected_offer_id !== null
      ) {
        const selected = offers.find(({ offer_id: offerId }) => offerId === runtimeResult.proposal.selected_offer_id);
        if (selected === undefined) {
          applied.intent.selected_offer_id = null;
          state = "AWAITING_OFFER_SELECTION";
          assistantMessage = "The selected offer is unavailable. Choose one of the current offers.";
        } else if (
          this.options.tools.createCheckout === undefined
          || this.options.tools.prepareAuthority === undefined
        ) {
          throw new Error("TravelBot checkout tools are not configured");
        } else {
          applied.intent.selected_offer_id = selected.offer_id;
          const current = { ...conversation, intent: applied.intent, offers };
          const checkout = await executeTool("create_checkout", {
            offer_id: selected.offer_id,
          }, () => this.options.tools.createCheckout!({
            conversation: current,
            offer: selected,
            idempotency_key: `checkout_${runId}`,
            correlation_id: command.correlation_id,
          }), (result) => ({
            checkout_id: result.checkout_id,
            checkout_hash: result.checkout_hash,
            merchant_id: result.merchant_id,
            amount: result.total.amount,
            currency: result.total.currency,
          }));
          const authority = await executeTool("prepare_authority", {
            checkout_hash: checkout.checkout_hash,
          }, () => this.options.tools.prepareAuthority!({
            conversation: current,
            checkout,
            idempotency_key: `authority_${runId}`,
            correlation_id: command.correlation_id,
          }), (result) => ({ mandate_id: result.mandate_id, status: result.status }));
          const approvalId = randomUUID();
          const approvalRuntimeResult = this.options.runtime.prepareApproval === undefined
            ? undefined
            : await this.options.runtime.prepareApproval({
              conversation_id: conversation.conversation_id,
              run_id: runId,
              model: this.options.model ?? "fake-test-model",
              state: "READY_TO_PURCHASE",
              intent: applied.intent,
              user_message: "Prepare the request_purchase interruption; the backend has not granted consent yet.",
              available_tools: ["request_purchase"],
            });
          const sdkRunState = approvalRuntimeResult?.interruption?.tool_name === "request_purchase"
            ? approvalRuntimeResult.interruption.sdk_run_state
            : undefined;
          if (
            this.options.runtime.prepareApproval !== undefined
            && (sdkRunState === undefined || this.options.approvalStateProtector === undefined)
          ) {
            applied.intent.selected_offer_id = null;
            operation = emptyOperation();
            state = "AWAITING_OFFER_SELECTION";
            assistantMessage = "I could not prepare a secure confirmation. Select the offer again.";
          } else {
            const protectedRunState = sdkRunState === undefined
              ? JSON.stringify({ version: 1, run_id: runId, action: "request_purchase" })
              : await this.options.approvalStateProtector!.seal(sdkRunState);
            operation = {
              checkout_id: checkout.checkout_id,
              checkout_hash: checkout.checkout_hash,
              mandate_id: authority.mandate_id,
              authorization_id: null,
              receipt_id: null,
              pending_approval: {
                approval_id: approvalId,
                merchant_id: checkout.merchant_id,
                checkout_hash: checkout.checkout_hash,
                amount: checkout.total.amount,
                currency: checkout.total.currency,
                mandate_id: authority.mandate_id,
                status: "PENDING",
                sdk_run_state: protectedRunState,
              },
            };
            state = "AWAITING_AUTHORITY_CONFIRMATION";
            assistantMessage = "The checkout is locked and the one-time authorization is ready. Review the flight, travelers, and total before deciding.";
          }
        }
      } else if (conversation.state === "AWAITING_AUTHORITY_CONFIRMATION") {
        state = "AWAITING_AUTHORITY_CONFIRMATION";
        const approval = operation.pending_approval;
        assistantMessage = approval === null
          ? "The previous confirmation is stale. Select the offer again."
          : `Explicitly confirm or deny ${approval.currency} ${(approval.amount / 100).toFixed(2)} for ${approval.merchant_id}.`;
      } else if (conversation.state === "AWAITING_OFFER_SELECTION") {
        state = "AWAITING_OFFER_SELECTION";
        assistantMessage = offers.length === 0
          ? "The offers are stale. Correct the details to search again."
          : "Choose one of the current options below to continue.";
      } else {
        state = "READY_TO_SEARCH";
        offers = (await executeTool("find_offers", {
          origin_iata: applied.intent.origin_iata,
          destination_iata: applied.intent.destination_iata,
          departure_date: applied.intent.departure_date,
        }, () => this.options.tools.findOffers(applied.intent), (result) => ({ count: result.length }))).filter((offer) => (
          offer.fulfillment.origin === applied.intent.origin_iata
          && offer.fulfillment.destination === applied.intent.destination_iata
          && offer.fulfillment.departure_at.startsWith(applied.intent.departure_date!)
          && offer.fulfillment.cabin === applied.intent.cabin
          && (
            applied.intent.max_total_budget === null
            || (
              offer.total.currency === applied.intent.max_total_budget.currency
              && offer.total.amount * applied.intent.passenger_count! <= applied.intent.max_total_budget.amount
            )
          )
        ));
        if (offers.length > 0) {
          state = "AWAITING_OFFER_SELECTION";
          const selectedDate = (
            offers[0]?.fulfillment.departure_local
            ?? offers[0]?.fulfillment.departure_at
            ?? ""
          ).slice(0, 10).split("-").toReversed().join("/");
          const flexibleDateNotice = /^\d{4}-\d{2}$/.test(applied.intent.departure_date!)
            ? ` Because you provided only the month, I used the first date with flights matching your criteria: ${selectedDate}.`
            : "";
          assistantMessage = `I found ${offers.length} ${offers.length === 1 ? "flight" : "flights"} within your budget.${flexibleDateNotice} Compare times, stops, and the total before choosing.`;
        } else {
          assistantMessage = "I found no flights matching these criteria. I can try another airport, date, or budget.";
        }
      }

      const completed = await this.options.repository.completeTurn(runId, {
        state,
        intent: applied.intent,
        offers,
        assistant_message: assistantMessage,
        provider_run_id: runtimeResult.provider_run_id,
        provider_response_id: runtimeResult.provider_response_id,
        usage: runtimeResult.usage,
        operation,
        invalidated_fields: applied.changed_fields,
        tool_executions: toolExecutions,
        state_transitions: conversation.state === "COLLECTING" && state === "AWAITING_OFFER_SELECTION"
          ? ["READY_TO_SEARCH", "AWAITING_OFFER_SELECTION"]
          : conversation.state === "AWAITING_AUTHORITY_CONFIRMATION" && state === "COMPLETED"
            ? ["READY_TO_PURCHASE", "EXECUTING", "COMPLETED"]
            : conversation.state === state ? [] : [state],
      }, this.options.clock.now());
      emitBestEffort(telemetry, {
        name: "state.transition",
        conversation_id: conversation.conversation_id,
        run_id: runId,
        correlation_id: command.correlation_id,
        model: this.options.model,
        state,
        status: "COMPLETED",
      });
      return view(completed);
    } catch (error) {
      const unavailable = error instanceof AgentRuntimeUnavailableError;
      const technicalToolFailure = toolExecutions.some(({ status }) => status === "FAILED")
        && !(error instanceof PublicApiError && error.statusCode < 500);
      const retryable = unavailable || technicalToolFailure;
      await this.options.repository.recordToolExecutions?.(runId, toolExecutions, this.options.clock.now());
      await this.options.repository.failTurn(
        runId,
        unavailable ? error.code : technicalToolFailure ? "tool_failure" : "internal_error",
        retryable,
        this.options.clock.now(),
      );
      emitBestEffort(telemetry, {
        name: "turn.failed",
        conversation_id: conversation.conversation_id,
        run_id: runId,
        correlation_id: command.correlation_id,
        model: this.options.model,
        state: conversation.state,
        status: "FAILED",
        reason_code: unavailable ? error.code : technicalToolFailure ? "tool_failure" : "internal_error",
      });
      if (retryable) {
        throw new PublicApiError(503, "invalid_request", "TravelBot is temporarily unavailable", {
          retryable: true,
          reason: unavailable ? error.code : "tool_failure",
        });
      }
      throw error;
    }
  }
}
