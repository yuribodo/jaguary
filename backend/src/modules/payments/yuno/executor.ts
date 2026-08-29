import { z } from "zod";

import type { YunoConfig } from "../../../config/env.js";
import {
  authorizedPaymentSchema,
  paymentResultSchema,
  utcRfc3339Schema,
  type AuthorizedPayment,
  type PaymentExecutor,
  type PaymentResult,
} from "../../../contracts/v1/index.js";

const supportedCurrencyExponents = {
  BRL: 2,
  USD: 2,
} as const;

const uuidSchema = z.uuid();
const runtimeSecretSchema = z.string()
  .min(1)
  .max(4096)
  .refine((value) => value === value.trim());

const enabledYunoConfigSchema = z.object({
  enabled: z.literal(true),
  baseUrl: z.literal("https://api-sandbox.y.uno"),
  accountId: uuidSchema,
  publicApiKey: runtimeSecretSchema,
  privateSecretKey: runtimeSecretSchema,
  country: z.string().regex(/^[A-Z]{2}$/),
  requestTimeoutMs: z.number().int().min(1).max(59_000),
}).strict();

const resolvedCredentialSchema = z.object({
  accountId: z.uuid(),
  customerId: z.uuid(),
  vaultedToken: z.string().min(1).max(4096),
}).strict();

const yunoPaymentResponseSchema = z.object({
  id: uuidSchema,
  account_id: z.uuid(),
  merchant_order_id: z.string().min(3).max(255),
  status: z.string().min(1).max(64),
  sub_status: z.string().min(1).max(128).optional(),
  amount: z.object({
    value: z.number().finite().nonnegative(),
    currency: z.string().regex(/^[A-Z]{3}$/),
  }),
  updated_at: utcRfc3339Schema.optional(),
  transactions: z.array(z.object({
    id: uuidSchema,
    type: z.string().min(1).max(64),
    status: z.string().min(1).max(64),
    response_code: z.string().min(1).max(128).optional(),
  })).optional(),
});

const partialYunoPaymentResponseSchema = z.object({
  id: uuidSchema.optional(),
});

export interface YunoPaymentCredential {
  accountId: string;
  customerId: string;
  vaultedToken: string;
}

export interface YunoCredentialResolver {
  resolve(credentialId: string): Promise<YunoPaymentCredential | undefined>;
}

export interface YunoPaymentExecutorDependencies {
  fetch: typeof fetch;
  credentialResolver: YunoCredentialResolver;
  now?: () => Date;
}

export class YunoAdapterError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "YunoAdapterError";
  }
}

function majorValue(amount: number, exponent: number): number {
  const digits = String(amount).padStart(exponent + 1, "0");
  const whole = digits.slice(0, -exponent);
  const fraction = digits.slice(-exponent);
  return Number(`${whole}.${fraction}`);
}

function minorUnits(value: number, exponent: number): number | undefined {
  const match = /^(0|[1-9]\d*)(?:\.(\d+))?$/.exec(String(value));
  if (match === null) return undefined;
  const whole = match[1]!;
  const suppliedFraction = match[2] ?? "";
  if (suppliedFraction.length > exponent) return undefined;
  const fraction = suppliedFraction.padEnd(exponent, "0");
  const amount = BigInt(`${whole}${fraction}`);
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : undefined;
}

function merchantOrderId(authorizationId: string): string {
  return `bound:${authorizationId}`;
}

const safeDeclineCodes = new Set([
  "card_declined",
  "declined",
  "do_not_honor",
  "insufficient_funds",
  "invalid_cvv",
  "invalid_data",
  "rejected",
  "stolen_card",
]);

function declineCode(responseCode: string | undefined): string {
  const normalized = responseCode?.toLowerCase().replaceAll(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized !== undefined && safeDeclineCodes.has(normalized)
    ? normalized
    : "provider_declined";
}

function isTimeoutError(error: unknown): boolean {
  return error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError");
}

export class YunoPaymentExecutor implements PaymentExecutor {
  readonly #now: () => Date;

  constructor(
    private readonly config: YunoConfig,
    private readonly dependencies: YunoPaymentExecutorDependencies,
  ) {
    this.#now = dependencies.now ?? (() => new Date());
  }

  async pay(input: AuthorizedPayment, idempotencyKey: string): Promise<PaymentResult> {
    const parsedConfig = enabledYunoConfigSchema.safeParse(this.config);
    if (!parsedConfig.success) {
      throw new YunoAdapterError("configuration_error", "Yuno payment execution is disabled");
    }
    const config = parsedConfig.data;

    let payment: AuthorizedPayment;
    try {
      payment = authorizedPaymentSchema.parse(input);
    } catch {
      throw new YunoAdapterError("invalid_authorized_payment", "Authorized payment is invalid");
    }
    if (!uuidSchema.safeParse(idempotencyKey).success) {
      throw new YunoAdapterError(
        "invalid_idempotency_key",
        "Yuno idempotency key must be a UUID",
      );
    }
    const exponent = supportedCurrencyExponents[
      payment.authorization.reserved_amount.currency as keyof typeof supportedCurrencyExponents
    ];
    if (exponent === undefined) {
      throw new YunoAdapterError("unsupported_currency", "Payment currency is not supported by Yuno");
    }

    let credential: YunoPaymentCredential;
    try {
      credential = resolvedCredentialSchema.parse(
        await this.dependencies.credentialResolver.resolve(payment.credential.credential_id),
      );
    } catch {
      throw new YunoAdapterError("credential_unavailable", "Payment credential is unavailable");
    }
    if (credential.accountId !== config.accountId) {
      throw new YunoAdapterError("credential_unavailable", "Payment credential is unavailable");
    }

    const orderId = merchantOrderId(payment.authorization.authorization_id);
    let response: Response;
    try {
      response = await this.dependencies.fetch(`${config.baseUrl}/v1/payments`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "public-api-key": config.publicApiKey,
          "private-secret-key": config.privateSecretKey,
          "x-idempotency-key": idempotencyKey,
        },
        body: JSON.stringify({
          account_id: config.accountId,
          merchant_order_id: orderId,
          merchant_reference: payment.authorization.checkout_id,
          description: "Bound authorized payment",
          country: config.country,
          amount: {
            currency: payment.authorization.reserved_amount.currency,
            value: majorValue(payment.authorization.reserved_amount.amount, exponent),
          },
          customer_payer: { id: credential.customerId },
          workflow: "DIRECT",
          payment_method: { type: "CARD", vaulted_token: credential.vaultedToken },
        }),
        signal: AbortSignal.timeout(config.requestTimeoutMs),
      });
    } catch (error) {
      if (isTimeoutError(error)) {
        return paymentResultSchema.parse({
          authorization_id: payment.authorization.authorization_id,
          amount: payment.authorization.reserved_amount,
          occurred_at: this.#now().toISOString(),
          status: "TIMEOUT",
        });
      }
      return paymentResultSchema.parse({
        authorization_id: payment.authorization.authorization_id,
        amount: payment.authorization.reserved_amount,
        occurred_at: this.#now().toISOString(),
        status: "UNKNOWN",
      });
    }
    if (response.status === 409 || response.status >= 500) {
      return paymentResultSchema.parse({
        authorization_id: payment.authorization.authorization_id,
        amount: payment.authorization.reserved_amount,
        occurred_at: this.#now().toISOString(),
        status: "UNKNOWN",
      });
    }
    if (response.status < 200 || response.status >= 300) {
      throw new YunoAdapterError("request_rejected", "Yuno rejected the payment request");
    }
    let responseBody: unknown;
    try {
      responseBody = await response.json();
    } catch {
      return paymentResultSchema.parse({
        authorization_id: payment.authorization.authorization_id,
        amount: payment.authorization.reserved_amount,
        occurred_at: this.#now().toISOString(),
        status: "UNKNOWN",
      });
    }
    const parsedProviderPayment = yunoPaymentResponseSchema.safeParse(responseBody);
    if (!parsedProviderPayment.success) {
      const partial = partialYunoPaymentResponseSchema.safeParse(responseBody);
      return paymentResultSchema.parse({
        authorization_id: payment.authorization.authorization_id,
        amount: payment.authorization.reserved_amount,
        occurred_at: this.#now().toISOString(),
        status: "UNKNOWN",
        ...(partial.success && partial.data.id !== undefined
          ? { payment_id: partial.data.id }
          : {}),
      });
    }
    const providerPayment = parsedProviderPayment.data;
    const purchase = providerPayment.transactions?.find((transaction) => transaction.type === "PURCHASE");
    const base = {
      authorization_id: payment.authorization.authorization_id,
      amount: payment.authorization.reserved_amount,
      occurred_at: providerPayment.updated_at ?? this.#now().toISOString(),
    };
    const responseAmount = minorUnits(providerPayment.amount.value, exponent);
    if (
      providerPayment.account_id !== config.accountId
      || providerPayment.merchant_order_id !== orderId
      || providerPayment.amount.currency !== payment.authorization.reserved_amount.currency
      || responseAmount !== payment.authorization.reserved_amount.amount
    ) {
      return paymentResultSchema.parse({
        ...base,
        status: "UNKNOWN",
        payment_id: providerPayment.id,
      });
    }
    if (
      providerPayment.status === "SUCCEEDED"
      && providerPayment.sub_status === "APPROVED"
    ) {
      return paymentResultSchema.parse({
        ...base,
        status: "APPROVED",
        payment_id: providerPayment.id,
        ...(purchase === undefined ? {} : { provider_reference: purchase.id }),
      });
    }
    if (
      providerPayment.status === "DECLINED"
      || providerPayment.status === "REJECTED"
      || providerPayment.sub_status === "DECLINED"
      || providerPayment.sub_status === "REJECTED"
    ) {
      return paymentResultSchema.parse({
        ...base,
        status: "DECLINED",
        payment_id: providerPayment.id,
        decline_code: declineCode(purchase?.response_code),
      });
    }
    return paymentResultSchema.parse({
      ...base,
      status: "UNKNOWN",
      payment_id: providerPayment.id,
    });
  }
}
