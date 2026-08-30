import { and, eq } from "drizzle-orm";

import { sha256CanonicalJson } from "../../contracts/v1/index.js";
import type { TransactionClient } from "../../db/database.js";
import { paymentCredentials } from "../../db/schema.js";

export interface PrincipalPaymentCredential {
  credentialId: string;
  display: string;
}

export interface PrincipalPaymentCredentialResolver {
  resolve(
    transaction: TransactionClient,
    requestedCredentialId: string,
    principalId: string,
    now: Date,
  ): Promise<PrincipalPaymentCredential | undefined>;
}

export class DemoPaymentCredentialResolver implements PrincipalPaymentCredentialResolver {
  constructor(private readonly templateCredentialId: string) {}

  async resolve(
    transaction: TransactionClient,
    requestedCredentialId: string,
    principalId: string,
    now: Date,
  ): Promise<PrincipalPaymentCredential | undefined> {
    const exact = (await transaction
      .select({ credentialId: paymentCredentials.credentialId, display: paymentCredentials.display })
      .from(paymentCredentials)
      .where(and(
        eq(paymentCredentials.credentialId, requestedCredentialId),
        eq(paymentCredentials.principalId, principalId),
      )))[0];
    if (exact !== undefined) return exact;
    if (requestedCredentialId !== this.templateCredentialId) return undefined;

    const template = (await transaction
      .select({ display: paymentCredentials.display })
      .from(paymentCredentials)
      .where(eq(paymentCredentials.credentialId, this.templateCredentialId)))[0];
    if (template === undefined) return undefined;
    const credentialId = `cred_demo_${sha256CanonicalJson({
      principal_id: principalId,
      template_credential_id: this.templateCredentialId,
    }).slice(0, 32)}`;
    await transaction.insert(paymentCredentials).values({
      credentialId,
      principalId,
      display: template.display,
      createdAt: now,
      updatedAt: now,
    }).onConflictDoNothing();
    return (await transaction
      .select({ credentialId: paymentCredentials.credentialId, display: paymentCredentials.display })
      .from(paymentCredentials)
      .where(and(
        eq(paymentCredentials.credentialId, credentialId),
        eq(paymentCredentials.principalId, principalId),
      )))[0];
  }
}
