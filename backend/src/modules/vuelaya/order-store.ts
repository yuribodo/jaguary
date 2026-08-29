import { and, eq } from "drizzle-orm";

import {
  orderReceiptSchema,
  type OrderReceipt,
} from "../../contracts/v1/index.js";
import type { DatabaseClient } from "../../db/database.js";
import { auditEvents, orders } from "../../db/schema.js";

export interface VuelaYaOrderStore {
  findById(orderId: string): Promise<OrderReceipt | undefined>;
  findByAuthorization(
    checkoutId: string,
    authorizationId: string,
  ): Promise<OrderReceipt | undefined>;
}

type OrderRow = typeof orders.$inferSelect;

export class PostgresVuelaYaOrderStore implements VuelaYaOrderStore {
  constructor(private readonly database: DatabaseClient) {}

  async #receipt(row: OrderRow | undefined): Promise<OrderReceipt | undefined> {
    if (row === undefined) return undefined;
    const evidence = (await this.database
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.eventId, row.auditEventId))
      .limit(1))[0];
    if (evidence === undefined || evidence.eventType !== "order.confirmed") {
      throw new Error("Confirmed VuelaYa order is missing its audit evidence");
    }
    return orderReceiptSchema.parse({
      receipt_id: row.receiptId,
      order_id: row.orderId,
      checkout_id: row.checkoutId,
      authorization_id: row.authorizationId,
      payment_id: row.paymentId,
      merchant_id: row.merchantId,
      status: row.status,
      items: row.items,
      total: { amount: row.totalAmount, currency: row.currency },
      fulfillment: row.fulfillment,
      issued_at: row.issuedAt.toISOString(),
      evidence: {
        event_id: evidence.eventId,
        correlation_id: evidence.correlationId,
        event_type: evidence.eventType,
        subject_id: evidence.subjectId,
        payload_hash: evidence.payloadHash,
        previous_hash: evidence.previousHash,
        event_hash: evidence.eventHash,
        recorded_at: evidence.recordedAt.toISOString(),
      },
    });
  }

  async findById(orderId: string): Promise<OrderReceipt | undefined> {
    const row = (await this.database
      .select()
      .from(orders)
      .where(eq(orders.orderId, orderId))
      .limit(1))[0];
    return this.#receipt(row);
  }

  async findByAuthorization(
    checkoutId: string,
    authorizationId: string,
  ): Promise<OrderReceipt | undefined> {
    const row = (await this.database
      .select()
      .from(orders)
      .where(and(
        eq(orders.checkoutId, checkoutId),
        eq(orders.authorizationId, authorizationId),
      ))
      .limit(1))[0];
    return this.#receipt(row);
  }
}
