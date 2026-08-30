import { and, desc, eq } from "drizzle-orm";

import {
  orderReceiptSchema,
  PublicApiError,
  type OrderReceipt,
} from "../../contracts/v1/index.js";
import type { DatabaseConnection } from "../../db/database.js";
import { auditEvents, authorizations, orders } from "../../db/schema.js";

import type { AuditLedgerService } from "./service.js";
import type { StoredAuditEvent } from "./types.js";

type OrderRow = typeof orders.$inferSelect;

function receiptFrom(order: OrderRow, event: StoredAuditEvent): OrderReceipt {
  return orderReceiptSchema.parse({
    receipt_id: order.receiptId,
    order_id: order.orderId,
    checkout_id: order.checkoutId,
    authorization_id: order.authorizationId,
    payment_id: order.paymentId,
    merchant_id: order.merchantId,
    status: order.status,
    items: order.items,
    total: { amount: order.totalAmount, currency: order.currency },
    fulfillment: order.fulfillment,
    issued_at: order.issuedAt.toISOString(),
    evidence: {
      event_id: event.eventId,
      correlation_id: event.correlationId,
      event_type: event.eventType,
      subject_id: event.subjectId,
      payload_hash: event.payloadHash,
      previous_hash: event.previousHash,
      event_hash: event.eventHash,
      recorded_at: event.recordedAt.toISOString(),
    },
  });
}

export class PostgresReceiptStore {
  constructor(
    private readonly database: DatabaseConnection,
    private readonly ledger: AuditLedgerService,
  ) {}

  async getOrder(orderId: string): Promise<OrderReceipt> {
    const receipt = await this.read(eq(orders.orderId, orderId));
    if (receipt === undefined) throw new PublicApiError(404, "not_found", "Order not found");
    return receipt;
  }

  async getReceipt(receiptId: string): Promise<OrderReceipt> {
    const receipt = await this.read(eq(orders.receiptId, receiptId));
    if (receipt === undefined) throw new PublicApiError(404, "not_found", "Receipt not found");
    return receipt;
  }

  async listReceipts(principalId: string): Promise<OrderReceipt[]> {
    const rows = await this.database.db
      .select({ order: orders })
      .from(orders)
      .innerJoin(authorizations, eq(authorizations.authorizationId, orders.authorizationId))
      .where(eq(authorizations.principalId, principalId))
      .orderBy(desc(orders.issuedAt));

    return Promise.all(rows.map(async ({ order }) => {
      const chain = await this.ledger.validateSubject(order.authorizationId);
      const event = chain.find(({ eventId }) => eventId === order.auditEventId);
      if (event === undefined) throw new Error("Receipt audit evidence is not in its validated chain");
      return receiptFrom(order, event);
    }));
  }

  async findById(orderId: string): Promise<OrderReceipt | undefined> {
    return this.read(eq(orders.orderId, orderId));
  }

  async findByAuthorization(
    checkoutId: string,
    authorizationId: string,
  ): Promise<OrderReceipt | undefined> {
    return this.read(and(
      eq(orders.checkoutId, checkoutId),
      eq(orders.authorizationId, authorizationId),
    ));
  }

  private async read(where: ReturnType<typeof eq> | ReturnType<typeof and>): Promise<OrderReceipt | undefined> {
    const row = (await this.database.db
      .select({ order: orders, event: auditEvents })
      .from(orders)
      .innerJoin(auditEvents, eq(auditEvents.eventId, orders.auditEventId))
      .where(where)
      .limit(1))[0];
    if (row === undefined) return undefined;
    const chain = await this.ledger.validateSubject(row.order.authorizationId);
    const event = chain.find(({ eventId }) => eventId === row.event.eventId);
    if (event === undefined) throw new Error("Receipt audit evidence is not in its validated chain");
    return receiptFrom(row.order, event);
  }
}
