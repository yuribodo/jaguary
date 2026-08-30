import type {
  Money,
  OfferCandidate,
  RequiredTravelIntentField,
  TravelIntent,
  TravelIntentProposal,
} from "../../contracts/v1/index.js";

export const travelBotStates = [
  "COLLECTING",
  "READY_TO_SEARCH",
  "AWAITING_OFFER_SELECTION",
  "AWAITING_AUTHORITY_CONFIRMATION",
  "READY_TO_PURCHASE",
  "EXECUTING",
  "COMPLETED",
  "FAILED",
] as const;

export type TravelBotState = (typeof travelBotStates)[number];

export const travelBotToolNames = [
  "find_offers",
  "create_checkout",
  "prepare_authority",
  "request_purchase",
  "get_receipt",
  "get_audit_timeline",
] as const;

export type TravelBotToolName = (typeof travelBotToolNames)[number];

export interface TravelBotMessage {
  message_id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sequence: number;
  correlation_id: string;
  created_at: string;
}

export interface TravelBotConversation {
  conversation_id: string;
  principal_id: string;
  agent_id: string;
  state: TravelBotState;
  version: number;
  intent: TravelIntent;
  offers: OfferCandidate[];
  messages: TravelBotMessage[];
  active_run_id: string | null;
  operation: TravelBotOperationState;
  created_at: string;
  updated_at: string;
}

export interface PendingTravelApproval {
  approval_id: string;
  merchant_id: string;
  checkout_hash: string;
  amount: number;
  currency: Money["currency"];
  mandate_id: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED" | "CONSUMED";
  sdk_run_state: string;
}

export interface TravelBotOperationState {
  checkout_id: string | null;
  checkout_hash: string | null;
  mandate_id: string | null;
  authorization_id: string | null;
  receipt_id: string | null;
  pending_approval: PendingTravelApproval | null;
}

export type TravelBotConversationView = Omit<TravelBotConversation, "operation"> & {
  operation: Omit<TravelBotOperationState, "pending_approval"> & {
    pending_approval: Omit<PendingTravelApproval, "sdk_run_state"> | null;
  };
  missing_fields: RequiredTravelIntentField[];
};

export interface AgentRuntimeRequest {
  conversation_id: string;
  run_id: string;
  model: string;
  state: TravelBotState;
  intent: TravelIntent;
  conversation_history?: Array<{
    role: TravelBotMessage["role"];
    content: string;
  }>;
  user_message: string;
  available_tools: TravelBotToolName[];
  backend_directive?: "PREPARE_PURCHASE_APPROVAL";
}

export interface AgentRuntimeResult {
  proposal: TravelIntentProposal;
  assistant_message: string;
  provider_run_id?: string;
  provider_response_id?: string;
  usage?: { input_tokens: number; output_tokens: number };
  interruption?: {
    tool_call_id: string;
    tool_name: TravelBotToolName;
    arguments: Record<string, unknown>;
    sdk_run_state: string;
  };
}

export interface AgentToolExecutionResult {
  status: "OK" | "REJECTED" | "FAILED";
  reference_id: string | null;
  reason_code: string | null;
}

export interface AgentToolExecutorPort {
  execute(input: {
    conversation_id: string;
    run_id: string;
    tool_call_id: string;
    tool_name: TravelBotToolName;
    arguments: Record<string, unknown>;
  }): Promise<AgentToolExecutionResult>;
}

export interface AgentRuntimePort {
  run(request: AgentRuntimeRequest): Promise<AgentRuntimeResult>;
  prepareApproval?(request: AgentRuntimeRequest): Promise<AgentRuntimeResult>;
  resumeApproval?(input: {
    request: AgentRuntimeRequest;
    sdk_run_state: string;
    approved: boolean;
  }): Promise<void>;
}

export interface CreateConversationCommand {
  principal_id: string;
  agent_id: string;
  idempotency_key: string;
  correlation_id: string;
}

export interface PostMessageCommand {
  conversation_id: string;
  content: string;
  idempotency_key: string;
  correlation_id: string;
}

export interface ClaimedTravelBotTurn {
  run_id: string;
  conversation: TravelBotConversation;
}

export interface CompletedTravelBotTurn {
  state: TravelBotState;
  intent: TravelIntent;
  offers: OfferCandidate[];
  assistant_message: string;
  provider_run_id?: string;
  provider_response_id?: string;
  usage?: { input_tokens: number; output_tokens: number };
  operation?: TravelBotOperationState;
  invalidated_fields?: string[];
  tool_executions?: CompletedTravelToolExecution[];
  state_transitions?: TravelBotState[];
}

export interface CompletedTravelToolExecution {
  tool_call_id: string;
  tool_name: TravelBotToolName;
  status: "COMPLETED" | "FAILED" | "REJECTED";
  arguments: Record<string, unknown>;
  result?: Record<string, unknown>;
  error_code?: string;
}

export interface TravelBotRepositoryPort {
  create(command: CreateConversationCommand, now: Date): Promise<TravelBotConversation>;
  get(conversationId: string): Promise<TravelBotConversation | undefined>;
  claimTurn(command: PostMessageCommand, now: Date): Promise<
    | { kind: "REPLAY"; conversation: TravelBotConversation }
    | { kind: "CLAIMED"; claim: ClaimedTravelBotTurn }
  >;
  completeTurn(runId: string, result: CompletedTravelBotTurn, now: Date): Promise<TravelBotConversation>;
  failTurn(runId: string, errorCode: string, retryable: boolean, now: Date): Promise<void>;
  recordToolExecutions?(runId: string, executions: CompletedTravelToolExecution[], now: Date): Promise<void>;
}

export interface TravelBotToolsPort {
  findOffers(intent: TravelIntent): Promise<OfferCandidate[]>;
  createCheckout?(input: {
    conversation: TravelBotConversation;
    offer: OfferCandidate;
    idempotency_key: string;
    correlation_id: string;
  }): Promise<{
    checkout_id: string;
    checkout_hash: string;
    merchant_id: string;
    total: Money;
  }>;
  prepareAuthority?(input: {
    conversation: TravelBotConversation;
    checkout: { checkout_id: string; checkout_hash: string; merchant_id: string; total: Money };
    idempotency_key: string;
    correlation_id: string;
  }): Promise<{ mandate_id: string; status: "DRAFT" | "ACTIVE" }>;
  activateAuthority?(input: {
    conversation: TravelBotConversation;
    mandate_id: string;
    idempotency_key: string;
    correlation_id: string;
  }): Promise<void>;
  requestPurchase?(input: {
    conversation: TravelBotConversation;
    idempotency_key: string;
    correlation_id: string;
  }): Promise<{
    status: "COMPLETED" | "DENIED" | "FAILED";
    reason_code?: string;
    authorization_id?: string;
    receipt_id?: string;
  }>;
  getReceipt?(conversation: TravelBotConversation): Promise<{
    receipt_id: string;
    status: string;
    total: Money;
  }>;
  getAuditTimeline?(conversation: TravelBotConversation): Promise<{
    correlation_id: string;
    event_count: number;
    event_types: string[];
  }>;
}
