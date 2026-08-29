import {
  authorizedPaymentSchema,
  paymentResultSchema,
  sha256CanonicalJson,
  type AuthorizedPayment,
  type PaymentExecutor,
  type PaymentResult,
  type PaymentResultStatus,
} from "../../contracts/v1/index.js";

export interface FakePaymentExecutorOptions {
  outcome: PaymentResultStatus;
  occurredAt: string;
}

export interface FakePaymentCall {
  authorization_id: string;
  idempotency_key: string;
}

function fakeIdentifier(prefix: string, authorizationId: string): string {
  const readable = `${prefix}_${authorizationId}`;
  return readable.length <= 128
    ? readable
    : `${prefix}_${sha256CanonicalJson({ authorization_id: authorizationId }).slice(0, 32)}`;
}

export class FakePaymentExecutor implements PaymentExecutor {
  readonly #calls: FakePaymentCall[] = [];

  constructor(private readonly options: FakePaymentExecutorOptions) {}

  get callCount(): number {
    return this.#calls.length;
  }

  get calls(): readonly FakePaymentCall[] {
    return this.#calls.map((call) => ({ ...call }));
  }

  async pay(input: AuthorizedPayment, idempotencyKey: string): Promise<PaymentResult> {
    const payment = authorizedPaymentSchema.parse(input);
    const authorizationId = payment.authorization.authorization_id;
    this.#calls.push({
      authorization_id: authorizationId,
      idempotency_key: idempotencyKey,
    });

    const base = {
      authorization_id: authorizationId,
      amount: payment.authorization.reserved_amount,
      occurred_at: this.options.occurredAt,
    };
    const paymentId = fakeIdentifier("payment_fake", authorizationId);

    switch (this.options.outcome) {
      case "APPROVED":
        return paymentResultSchema.parse({
          ...base,
          status: "APPROVED",
          payment_id: paymentId,
          provider_reference: fakeIdentifier("fake_ref", authorizationId),
        });
      case "DECLINED":
        return paymentResultSchema.parse({
          ...base,
          status: "DECLINED",
          payment_id: paymentId,
          decline_code: "fake_declined",
        });
      case "TIMEOUT":
        return paymentResultSchema.parse({ ...base, status: "TIMEOUT" });
      case "UNKNOWN":
        return paymentResultSchema.parse({
          ...base,
          status: "UNKNOWN",
          payment_id: paymentId,
        });
    }
  }
}
