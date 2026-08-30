import { desc, eq } from "drizzle-orm";

import {
  paymentMethodSummarySchema,
  type PaymentMethodNetwork,
  type PaymentMethodSummary,
} from "../../contracts/v1/index.js";
import type { DatabaseConnection } from "../../db/database.js";
import { paymentCredentials } from "../../db/schema.js";

type PaymentCredentialRow = Pick<
  typeof paymentCredentials.$inferSelect,
  "credentialId" | "display" | "createdAt" | "updatedAt"
>;

function networkFromDisplay(display: string): PaymentMethodNetwork {
  const normalized = display.toLowerCase();
  if (/\bvisa\b/.test(normalized)) return "VISA";
  if (/\b(mastercard|master card)\b/.test(normalized)) return "MASTERCARD";
  return "OTHER";
}

function lastFourFromDisplay(display: string): string | null {
  const digits = display.replace(/\D/g, "");
  return digits.length >= 4 ? digits.slice(-4) : null;
}

export function paymentMethodSummaryFromRow(row: PaymentCredentialRow): PaymentMethodSummary {
  const network = networkFromDisplay(row.display);
  const lastFour = lastFourFromDisplay(row.display);
  const networkLabel = network === "MASTERCARD" ? "Mastercard" : network === "VISA" ? "Visa" : "Payment method";

  return paymentMethodSummarySchema.parse({
    credential_id: row.credentialId,
    network,
    last_four: lastFour,
    label: lastFour === null ? networkLabel : `${networkLabel} ending in ${lastFour}`,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  });
}

export interface PaymentCredentialReader {
  listForPrincipal(principalId: string): Promise<PaymentMethodSummary[]>;
}

export class PostgresPaymentCredentialReader implements PaymentCredentialReader {
  constructor(private readonly database: DatabaseConnection) {}

  async listForPrincipal(principalId: string): Promise<PaymentMethodSummary[]> {
    const rows = await this.database.db
      .select({
        credentialId: paymentCredentials.credentialId,
        display: paymentCredentials.display,
        createdAt: paymentCredentials.createdAt,
        updatedAt: paymentCredentials.updatedAt,
      })
      .from(paymentCredentials)
      .where(eq(paymentCredentials.principalId, principalId))
      .orderBy(desc(paymentCredentials.updatedAt));

    return rows.map(paymentMethodSummaryFromRow);
  }
}
