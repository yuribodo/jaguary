import {
  paymentResultSchema,
  type AuthorizedPayment,
  type PaymentExecutor,
  type PaymentResult,
} from "../../contracts/v1/index.js";

export type PaymentClaim =
  | {
    kind: "CLAIMED";
    payment_attempt_id: string;
    idempotency_key: string;
    payment: AuthorizedPayment;
  }
  | {
    kind: "COMPLETED";
    result: PaymentResult;
  };

export interface PaymentClaimStore {
  claim(authorizationId: string, correlationId: string): Promise<PaymentClaim>;
  persistResult(paymentAttemptId: string, result: PaymentResult): Promise<PaymentResult>;
}

export class PaymentService {
  constructor(
    private readonly store: PaymentClaimStore,
    private readonly executor: PaymentExecutor,
  ) {}

  async pay(authorizationId: string, correlationId: string): Promise<PaymentResult> {
    const claim = await this.store.claim(authorizationId, correlationId);
    if (claim.kind === "COMPLETED") return claim.result;

    const result = paymentResultSchema.parse(
      await this.executor.pay(claim.payment, claim.idempotency_key),
    );
    const authorization = claim.payment.authorization;
    if (
      result.authorization_id !== authorization.authorization_id
      || result.amount.amount !== authorization.reserved_amount.amount
      || result.amount.currency !== authorization.reserved_amount.currency
    ) {
      throw new Error("Payment executor result does not match its persisted authorization");
    }
    return this.store.persistResult(claim.payment_attempt_id, result);
  }
}
