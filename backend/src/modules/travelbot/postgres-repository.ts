import { randomUUID } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";

import {
  offerCandidateSchema,
  PublicApiError,
  sha256CanonicalJson,
  travelBotStateSchema,
  travelIntentSchema,
  type AgentEligibilityPort,
} from "../../contracts/v1/index.js";
import type { DatabaseClient, DatabaseConnection, TransactionClient } from "../../db/database.js";
import {
  agents,
  travelConversations,
  travelApprovals,
  travelIntentSnapshots,
  travelMessages,
  travelModelRuns,
  travelSseEvents,
  travelToolExecutions,
} from "../../db/schema.js";
import { emptyTravelIntent } from "./policy.js";
import { redactSensitiveText } from "./redaction.js";
import type {
  CompletedTravelBotTurn,
  CompletedTravelToolExecution,
  CreateConversationCommand,
  PostMessageCommand,
  TravelBotConversation,
  TravelBotRepositoryPort,
} from "./types.js";

type ConversationRow = typeof travelConversations.$inferSelect;
const RUN_LEASE_MS = 30_000;

async function lockConversation(database: TransactionClient, conversationId: string): Promise<void> {
  await database.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${conversationId}))`);
}

async function conversationFrom(
  database: DatabaseClient | TransactionClient,
  row: ConversationRow,
): Promise<TravelBotConversation> {
  const messages = await database
    .select()
    .from(travelMessages)
    .where(eq(travelMessages.conversationId, row.conversationId))
    .orderBy(asc(travelMessages.sequence));
  const pendingApproval = (await database.select().from(travelApprovals).where(and(
    eq(travelApprovals.conversationId, row.conversationId),
    eq(travelApprovals.status, "PENDING"),
  )).limit(1))[0];
  return {
    conversation_id: row.conversationId,
    principal_id: row.principalId,
    agent_id: row.agentId,
    state: travelBotStateSchema.parse(row.state),
    version: row.version,
    intent: travelIntentSchema.parse(row.intent),
    offers: offerCandidateSchema.array().parse(row.offers),
    messages: messages.map((message) => ({
      message_id: message.messageId,
      role: message.role === "USER" ? "USER" : "ASSISTANT",
      content: message.content,
      sequence: message.sequence,
      correlation_id: message.correlationId,
      created_at: message.createdAt.toISOString(),
    })),
    active_run_id: row.activeRunId,
    operation: {
      checkout_id: row.selectedCheckoutId,
      checkout_hash: row.selectedCheckoutHash,
      mandate_id: row.mandateId,
      authorization_id: row.authorizationId,
      receipt_id: row.receiptId,
      pending_approval: pendingApproval === undefined ? null : {
        approval_id: pendingApproval.approvalId,
        merchant_id: pendingApproval.merchantId,
        checkout_hash: pendingApproval.checkoutHash,
        amount: pendingApproval.amount,
        currency: pendingApproval.currency as never,
        mandate_id: pendingApproval.mandateId,
        status: "PENDING",
        sdk_run_state: pendingApproval.sdkRunState,
      },
    },
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  };
}

async function getConversationRow(
  database: DatabaseClient | TransactionClient,
  conversationId: string,
): Promise<ConversationRow | undefined> {
  return (await database
    .select()
    .from(travelConversations)
    .where(eq(travelConversations.conversationId, conversationId)))[0];
}

export class PostgresTravelBotRepository implements TravelBotRepositoryPort {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly model: string,
    private readonly eligibility?: AgentEligibilityPort,
  ) {}

  async create(command: CreateConversationCommand, now: Date): Promise<TravelBotConversation> {
    if (this.eligibility !== undefined) {
      const decision = await this.eligibility.evaluate(command.agent_id, { purpose: "EXECUTION" }, now);
      if (!decision.eligible) throw new PublicApiError(403, decision.reason ?? "agent_not_active", "TravelBot agent is not eligible");
    }
    const requestHash = sha256CanonicalJson({
      principal_id: command.principal_id,
      agent_id: command.agent_id,
    });
    return this.database.transaction(async (transaction) => {
      const replay = (await transaction
        .select()
        .from(travelConversations)
        .where(eq(travelConversations.creationIdempotencyKey, command.idempotency_key)))[0];
      if (replay !== undefined) {
        if (replay.creationRequestHash !== requestHash) {
          throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was already used with another conversation");
        }
        return conversationFrom(transaction, replay);
      }
      if (this.eligibility === undefined) {
        const agent = (await transaction.select({ status: agents.status }).from(agents).where(and(
          eq(agents.agentId, command.agent_id),
        )))[0];
        if (agent === undefined || agent.status !== "ACTIVE") throw new PublicApiError(400, "invalid_request", "TravelBot agent is unknown or inactive");
      }
      const conversationId = randomUUID();
      const intent = emptyTravelIntent();
      const row = (await transaction.insert(travelConversations).values({
        conversationId,
        principalId: command.principal_id,
        agentId: command.agent_id,
        state: "COLLECTING",
        version: 0,
        intent,
        offers: [],
        creationRequestHash: requestHash,
        creationIdempotencyKey: command.idempotency_key,
        correlationId: command.correlation_id,
        createdAt: now,
        updatedAt: now,
      }).returning())[0]!;
      await transaction.insert(travelIntentSnapshots).values({
        snapshotId: randomUUID(),
        conversationId,
        conversationVersion: 0,
        state: "COLLECTING",
        intent,
        invalidatedFields: [],
        createdAt: now,
      });
      await transaction.insert(travelSseEvents).values({
        eventId: randomUUID(),
        conversationId,
        sequence: 1,
        eventType: "state.snapshot",
        payload: { state: "COLLECTING", version: 0, missing_fields: [
          "origin_iata",
          "destination_iata",
          "departure_date",
          "max_total_budget",
        ] },
        createdAt: now,
      });
      return conversationFrom(transaction, row);
    });
  }

  async get(conversationId: string): Promise<TravelBotConversation | undefined> {
    const row = await getConversationRow(this.database.db, conversationId);
    return row === undefined ? undefined : conversationFrom(this.database.db, row);
  }

  async discard(conversationId: string, principalId: string): Promise<"DELETED" | "IN_PROGRESS" | "NOT_FOUND"> {
    return this.database.transaction(async (transaction) => {
      await lockConversation(transaction, conversationId);
      const row = await getConversationRow(transaction, conversationId);
      if (row === undefined || row.principalId !== principalId) return "NOT_FOUND";
      if (row.activeRunId !== null) return "IN_PROGRESS";

      await transaction.delete(travelApprovals).where(eq(travelApprovals.conversationId, conversationId));
      await transaction.delete(travelToolExecutions).where(eq(travelToolExecutions.conversationId, conversationId));
      await transaction.delete(travelSseEvents).where(eq(travelSseEvents.conversationId, conversationId));
      await transaction.delete(travelIntentSnapshots).where(eq(travelIntentSnapshots.conversationId, conversationId));
      await transaction.delete(travelModelRuns).where(eq(travelModelRuns.conversationId, conversationId));
      await transaction.delete(travelMessages).where(eq(travelMessages.conversationId, conversationId));
      await transaction.delete(travelConversations).where(eq(travelConversations.conversationId, conversationId));
      return "DELETED";
    });
  }

  async claimTurn(command: PostMessageCommand, now: Date) {
    const contentHash = sha256CanonicalJson(command.content);
    return this.database.transaction(async (transaction) => {
      await lockConversation(transaction, command.conversation_id);
      const replayMessage = (await transaction
        .select()
        .from(travelMessages)
        .where(eq(travelMessages.idempotencyKey, command.idempotency_key)))[0];
      if (replayMessage !== undefined) {
        if (
          replayMessage.conversationId !== command.conversation_id
          || replayMessage.contentHash !== contentHash
        ) {
          throw new PublicApiError(409, "idempotency_conflict", "Idempotency-Key was already used with a different message");
        }
        const run = (await transaction
          .select()
          .from(travelModelRuns)
          .where(eq(travelModelRuns.inputMessageId, replayMessage.messageId)))[0];
        if (run === undefined) throw new Error("Idempotent TravelBot message has no model run");
        const row = await getConversationRow(transaction, command.conversation_id);
        if (row === undefined) throw new Error("Idempotent TravelBot conversation disappeared");
        if (run.status === "COMPLETED") {
          return { kind: "REPLAY" as const, conversation: await conversationFrom(transaction, row) };
        }
        if (
          run.status === "RUNNING"
          && row.activeRunId === run.runId
          && now.getTime() - run.startedAt.getTime() >= RUN_LEASE_MS
        ) {
          await transaction.update(travelModelRuns).set({ startedAt: now })
            .where(eq(travelModelRuns.runId, run.runId));
          await transaction.update(travelConversations).set({ updatedAt: now })
            .where(eq(travelConversations.conversationId, command.conversation_id));
          return {
            kind: "CLAIMED" as const,
            claim: {
              run_id: run.runId,
              conversation: await conversationFrom(transaction, row),
            },
          };
        }
        if (run.status === "FAILED" && run.retryable === 1 && row.activeRunId === null) {
          await transaction.update(travelModelRuns).set({
            status: "RUNNING",
            errorCode: null,
            retryable: 0,
            startedAt: now,
            completedAt: null,
          }).where(eq(travelModelRuns.runId, run.runId));
          await transaction.update(travelConversations).set({
            activeRunId: run.runId,
            updatedAt: now,
          }).where(eq(travelConversations.conversationId, command.conversation_id));
          return {
            kind: "CLAIMED" as const,
            claim: {
              run_id: run.runId,
              conversation: await conversationFrom(transaction, { ...row, activeRunId: run.runId }),
            },
          };
        }
        throw new PublicApiError(409, "invalid_request", "Conversation turn is already in progress", {
          retryable: true,
        });
      }

      const row = await getConversationRow(transaction, command.conversation_id);
      if (row === undefined) throw new PublicApiError(404, "not_found", "Conversation not found");
      if (row.activeRunId !== null) {
        throw new PublicApiError(409, "invalid_request", "Conversation already has a turn in progress", {
          retryable: true,
        });
      }
      const sequence = (await transaction
        .select({ value: sql<number>`coalesce(max(${travelMessages.sequence}), 0)` })
        .from(travelMessages)
        .where(eq(travelMessages.conversationId, command.conversation_id)))[0]!.value + 1;
      const messageId = randomUUID();
      const runId = randomUUID();
      const requestHash = sha256CanonicalJson({
        conversation_id: command.conversation_id,
        conversation_version: row.version,
        content: command.content,
      });
      await transaction.insert(travelMessages).values({
        messageId,
        conversationId: command.conversation_id,
        sequence,
        role: "USER",
        content: redactSensitiveText(command.content),
        contentHash,
        idempotencyKey: command.idempotency_key,
        correlationId: command.correlation_id,
        createdAt: now,
      });
      await transaction.insert(travelModelRuns).values({
        runId,
        conversationId: command.conversation_id,
        inputMessageId: messageId,
        status: "RUNNING",
        model: this.model,
        requestHash,
        idempotencyKey: command.idempotency_key,
        correlationId: command.correlation_id,
        startedAt: now,
      });
      await transaction.update(travelConversations).set({ activeRunId: runId, updatedAt: now })
        .where(eq(travelConversations.conversationId, command.conversation_id));
      return {
        kind: "CLAIMED" as const,
        claim: {
          run_id: runId,
          conversation: await conversationFrom(transaction, { ...row, activeRunId: runId, updatedAt: now }),
        },
      };
    });
  }

  async completeTurn(runId: string, result: CompletedTravelBotTurn, now: Date) {
    return this.database.transaction(async (transaction) => {
      const run = (await transaction.select().from(travelModelRuns)
        .where(eq(travelModelRuns.runId, runId)))[0];
      if (run === undefined) throw new Error("TravelBot model run does not exist");
      await lockConversation(transaction, run.conversationId);
      const row = await getConversationRow(transaction, run.conversationId);
      if (row === undefined || row.activeRunId !== runId || run.status !== "RUNNING") {
        throw new Error("TravelBot model run is no longer active");
      }
      const assistantContent = redactSensitiveText(result.assistant_message);
      const nextSequence = (await transaction
        .select({ value: sql<number>`coalesce(max(${travelMessages.sequence}), 0)` })
        .from(travelMessages)
        .where(eq(travelMessages.conversationId, run.conversationId)))[0]!.value + 1;
      await transaction.insert(travelMessages).values({
        messageId: randomUUID(),
        conversationId: run.conversationId,
        sequence: nextSequence,
        role: "ASSISTANT",
        content: assistantContent,
        contentHash: sha256CanonicalJson(assistantContent),
        correlationId: run.correlationId,
        createdAt: now,
      });
      const nextVersion = row.version + 1;
      const updated = (await transaction.update(travelConversations).set({
        state: result.state,
        version: nextVersion,
        intent: result.intent,
        offers: result.offers,
        activeRunId: null,
        ...(result.operation === undefined ? {} : {
          selectedCheckoutId: result.operation.checkout_id,
          selectedCheckoutHash: result.operation.checkout_hash,
          mandateId: result.operation.mandate_id,
          authorizationId: result.operation.authorization_id,
          receiptId: result.operation.receipt_id,
        }),
        updatedAt: now,
      }).where(and(
        eq(travelConversations.conversationId, run.conversationId),
        eq(travelConversations.activeRunId, runId),
      )).returning())[0];
      if (updated === undefined) throw new Error("TravelBot conversation completion lost its claim");
      await this.#insertToolExecutions(transaction, runId, run.conversationId, result.tool_executions ?? [], now);
      if (result.operation !== undefined) {
        const confirmation = result.intent.confirmation;
        await transaction.update(travelApprovals).set({
          status: confirmation?.decision === "CONFIRMED"
            ? "CONSUMED"
            : confirmation?.decision === "DENIED"
              ? "DENIED"
              : "CANCELLED",
          decidedAt: now,
          ...(confirmation?.decision === "CONFIRMED" ? { consumedAt: now } : {}),
        }).where(and(
          eq(travelApprovals.conversationId, run.conversationId),
          eq(travelApprovals.status, "PENDING"),
        ));
        const approval = result.operation.pending_approval;
        if (approval !== null) {
          await transaction.insert(travelApprovals).values({
            approvalId: approval.approval_id,
            conversationId: run.conversationId,
            runId,
            toolCallId: `approval_${approval.approval_id}`,
            merchantId: approval.merchant_id,
            checkoutHash: approval.checkout_hash,
            amount: approval.amount,
            currency: approval.currency,
            mandateId: approval.mandate_id,
            status: approval.status,
            sdkRunState: approval.sdk_run_state,
            createdAt: now,
          });
        }
      }
      await transaction.insert(travelIntentSnapshots).values({
        snapshotId: randomUUID(),
        conversationId: run.conversationId,
        conversationVersion: nextVersion,
        state: result.state,
        intent: result.intent,
        invalidatedFields: result.invalidated_fields ?? [],
        createdAt: now,
      });
      await transaction.update(travelModelRuns).set({
        status: "COMPLETED",
        providerRunId: result.provider_run_id,
        providerResponseId: result.provider_response_id,
        inputTokens: result.usage?.input_tokens,
        outputTokens: result.usage?.output_tokens,
        completedAt: now,
      }).where(eq(travelModelRuns.runId, runId));
      const currentEventSequence = (await transaction
        .select({ value: sql<number>`coalesce(max(${travelSseEvents.sequence}), 0)` })
        .from(travelSseEvents)
        .where(eq(travelSseEvents.conversationId, run.conversationId)))[0]!.value;
      const transitions = result.state_transitions?.length === 0
        ? [result.state]
        : (result.state_transitions ?? [result.state]);
      const events: Array<typeof travelSseEvents.$inferInsert> = [{
        eventId: randomUUID(),
        conversationId: run.conversationId,
        sequence: currentEventSequence + 1,
        eventType: "assistant.delta",
        payload: { text: assistantContent },
        createdAt: now,
      }];
      for (const [index, transition] of transitions.entries()) {
        events.push({
          eventId: randomUUID(),
          conversationId: run.conversationId,
          sequence: currentEventSequence + index + 2,
          eventType: "state.snapshot",
          payload: { state: transition, version: nextVersion, final: transition === result.state },
          createdAt: now,
        });
      }
      events.push({
        eventId: randomUUID(),
        conversationId: run.conversationId,
        sequence: currentEventSequence + transitions.length + 2,
        eventType: "turn.completed",
        payload: { run_id: runId },
        createdAt: now,
      });
      await transaction.insert(travelSseEvents).values(events);
      return conversationFrom(transaction, updated);
    });
  }

  async #insertToolExecutions(
    transaction: TransactionClient,
    runId: string,
    conversationId: string,
    executions: CompletedTravelToolExecution[],
    now: Date,
  ): Promise<void> {
    for (const execution of executions) {
      await transaction.insert(travelToolExecutions).values({
        executionId: randomUUID(),
        conversationId,
        runId,
        toolCallId: execution.tool_call_id,
        toolName: execution.tool_name,
        argumentsHash: sha256CanonicalJson(execution.arguments),
        status: execution.status,
        result: execution.result,
        errorCode: execution.error_code,
        idempotencyKey: `${execution.tool_name}_${runId}_${sha256CanonicalJson(execution.tool_call_id).slice(0, 16)}`,
        startedAt: now,
        completedAt: now,
      }).onConflictDoNothing({ target: [travelToolExecutions.runId, travelToolExecutions.toolCallId] });
    }
  }

  async recordToolExecutions(
    runId: string,
    executions: CompletedTravelToolExecution[],
    now: Date,
  ): Promise<void> {
    if (executions.length === 0) return;
    await this.database.transaction(async (transaction) => {
      const run = (await transaction.select({ conversationId: travelModelRuns.conversationId })
        .from(travelModelRuns).where(eq(travelModelRuns.runId, runId)))[0];
      if (run !== undefined) {
        await this.#insertToolExecutions(transaction, runId, run.conversationId, executions, now);
      }
    });
  }

  async failTurn(runId: string, errorCode: string, retryable: boolean, now: Date): Promise<void> {
    await this.database.transaction(async (transaction) => {
      const run = (await transaction.select().from(travelModelRuns)
        .where(eq(travelModelRuns.runId, runId)))[0];
      if (run === undefined) return;
      await lockConversation(transaction, run.conversationId);
      await transaction.update(travelModelRuns).set({
        status: "FAILED",
        errorCode,
        retryable: retryable ? 1 : 0,
        completedAt: now,
      }).where(and(eq(travelModelRuns.runId, runId), eq(travelModelRuns.status, "RUNNING")));
      await transaction.update(travelConversations).set({ activeRunId: null })
        .where(and(
          eq(travelConversations.conversationId, run.conversationId),
          eq(travelConversations.activeRunId, runId),
        ));
    });
  }

  async listSseEvents(conversationId: string, afterSequence = 0) {
    const rows = await this.database.db.select().from(travelSseEvents).where(and(
      eq(travelSseEvents.conversationId, conversationId),
      sql`${travelSseEvents.sequence} > ${afterSequence}`,
    )).orderBy(asc(travelSseEvents.sequence));
    return rows.map((row) => ({
      sequence: row.sequence,
      event_type: row.eventType,
      payload: row.payload,
    }));
  }
}
