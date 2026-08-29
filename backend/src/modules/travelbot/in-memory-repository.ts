import { randomUUID } from "node:crypto";

import { PublicApiError, sha256CanonicalJson } from "../../contracts/v1/index.js";
import { emptyTravelIntent } from "./policy.js";
import { redactSensitiveText } from "./redaction.js";
import type {
  CompletedTravelBotTurn,
  CreateConversationCommand,
  PostMessageCommand,
  TravelBotConversation,
  TravelBotRepositoryPort,
} from "./types.js";

function clone(conversation: TravelBotConversation): TravelBotConversation {
  return structuredClone(conversation);
}

export class InMemoryTravelBotRepository implements TravelBotRepositoryPort {
  readonly #conversations = new Map<string, TravelBotConversation>();
  readonly #creationKeys = new Map<string, string>();
  readonly #messageKeys = new Map<string, {
    conversationId: string;
    runId: string;
    contentHash: string;
    complete: boolean;
    failed: boolean;
  }>();

  async create(command: CreateConversationCommand, now: Date): Promise<TravelBotConversation> {
    const replayId = this.#creationKeys.get(command.idempotency_key);
    if (replayId !== undefined) return clone(this.#conversations.get(replayId)!);
    const timestamp = now.toISOString();
    const conversation: TravelBotConversation = {
      conversation_id: randomUUID(),
      principal_id: command.principal_id,
      agent_id: command.agent_id,
      state: "COLLECTING",
      version: 0,
      intent: emptyTravelIntent(),
      offers: [],
      messages: [],
      active_run_id: null,
      operation: {
        checkout_id: null,
        checkout_hash: null,
        mandate_id: null,
        authorization_id: null,
        receipt_id: null,
        pending_approval: null,
      },
      created_at: timestamp,
      updated_at: timestamp,
    };
    this.#conversations.set(conversation.conversation_id, conversation);
    this.#creationKeys.set(command.idempotency_key, conversation.conversation_id);
    return clone(conversation);
  }

  async get(conversationId: string): Promise<TravelBotConversation | undefined> {
    const conversation = this.#conversations.get(conversationId);
    return conversation === undefined ? undefined : clone(conversation);
  }

  async claimTurn(command: PostMessageCommand, now: Date) {
    const replay = this.#messageKeys.get(command.idempotency_key);
    if (replay !== undefined) {
      if (
        replay.conversationId !== command.conversation_id
        || replay.contentHash !== sha256CanonicalJson(command.content)
      ) {
        throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key belongs to another conversation");
      }
      const conversation = this.#conversations.get(command.conversation_id)!;
      if (replay.complete) return { kind: "REPLAY" as const, conversation: clone(conversation) };
      if (replay.failed && conversation.active_run_id === null) {
        replay.failed = false;
        conversation.active_run_id = replay.runId;
        return {
          kind: "CLAIMED" as const,
          claim: { run_id: replay.runId, conversation: clone(conversation) },
        };
      }
      throw new PublicApiError(409, "invalid_request", "Conversation turn is still in progress", {
        retryable: true,
      });
    }
    const conversation = this.#conversations.get(command.conversation_id);
    if (conversation === undefined) throw new PublicApiError(404, "not_found", "Conversation not found");
    if (conversation.active_run_id !== null) {
      throw new PublicApiError(409, "invalid_request", "Conversation already has a turn in progress", {
        retryable: true,
      });
    }
    const runId = randomUUID();
    const createdAt = now.toISOString();
    conversation.messages.push({
      message_id: randomUUID(),
      role: "USER",
      content: redactSensitiveText(command.content),
      sequence: conversation.messages.length + 1,
      correlation_id: command.correlation_id,
      created_at: createdAt,
    });
    conversation.active_run_id = runId;
    conversation.updated_at = createdAt;
    this.#messageKeys.set(command.idempotency_key, {
      conversationId: command.conversation_id,
      runId,
      contentHash: sha256CanonicalJson(command.content),
      complete: false,
      failed: false,
    });
    return { kind: "CLAIMED" as const, claim: { run_id: runId, conversation: clone(conversation) } };
  }

  async completeTurn(runId: string, result: CompletedTravelBotTurn, now: Date) {
    const conversation = [...this.#conversations.values()].find(({ active_run_id: id }) => id === runId);
    if (conversation === undefined) throw new Error("TravelBot run is no longer active");
    const createdAt = now.toISOString();
    conversation.state = result.state;
    conversation.intent = structuredClone(result.intent);
    conversation.offers = structuredClone(result.offers);
    if (result.operation !== undefined) conversation.operation = structuredClone(result.operation);
    conversation.version += 1;
    conversation.messages.push({
      message_id: randomUUID(),
      role: "ASSISTANT",
      content: result.assistant_message,
      sequence: conversation.messages.length + 1,
      correlation_id: conversation.messages.at(-1)!.correlation_id,
      created_at: createdAt,
    });
    conversation.active_run_id = null;
    conversation.updated_at = createdAt;
    for (const value of this.#messageKeys.values()) {
      if (value.runId === runId) value.complete = true;
    }
    return clone(conversation);
  }

  async failTurn(runId: string, _errorCode: string, retryable: boolean): Promise<void> {
    const conversation = [...this.#conversations.values()].find(({ active_run_id: id }) => id === runId);
    if (conversation !== undefined) conversation.active_run_id = null;
    for (const value of this.#messageKeys.values()) {
      if (value.runId === runId) value.failed = retryable;
    }
  }
}
