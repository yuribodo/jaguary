import { z } from "zod";

/** Active ISO 4217 alphabetic currency codes supported by the contract. */
export const ISO_4217_CURRENCIES = [
  "AED", "AFN", "ALL", "AMD", "AOA", "ARS", "AUD", "AWG", "AZN", "BAM",
  "BBD", "BDT", "BGN", "BHD", "BIF", "BMD", "BND", "BOB", "BOV", "BRL",
  "BSD", "BTN", "BWP", "BYN", "BZD", "CAD", "CDF", "CHE", "CHF", "CHW",
  "CLF", "CLP", "CNY", "COP", "COU", "CRC", "CUP", "CVE", "CZK", "DJF",
  "DKK", "DOP", "DZD", "EGP", "ERN", "ETB", "EUR", "FJD", "FKP", "GBP",
  "GEL", "GHS", "GIP", "GMD", "GNF", "GTQ", "GYD", "HKD", "HNL", "HTG",
  "HUF", "IDR", "ILS", "INR", "IQD", "IRR", "ISK", "JMD", "JOD", "JPY",
  "KES", "KGS", "KHR", "KMF", "KPW", "KRW", "KWD", "KYD", "KZT", "LAK",
  "LBP", "LKR", "LRD", "LSL", "LYD", "MAD", "MDL", "MGA", "MKD", "MMK",
  "MNT", "MOP", "MRU", "MUR", "MVR", "MWK", "MXN", "MXV", "MYR", "MZN",
  "NAD", "NGN", "NIO", "NOK", "NPR", "NZD", "OMR", "PAB", "PEN", "PGK",
  "PHP", "PKR", "PLN", "PYG", "QAR", "RON", "RSD", "RUB", "RWF", "SAR",
  "SBD", "SCR", "SDG", "SEK", "SGD", "SHP", "SLE", "SOS", "SRD", "SSP",
  "STN", "SVC", "SYP", "SZL", "THB", "TJS", "TMT", "TND", "TOP", "TRY",
  "TTD", "TWD", "TZS", "UAH", "UGX", "USD", "USN", "UYI", "UYU", "UYW",
  "UZS", "VED", "VES", "VND", "VUV", "WST", "XAF", "XAG", "XAU", "XBA",
  "XBB", "XBC", "XBD", "XCD", "XDR", "XOF", "XPD", "XPF", "XPT", "XSU",
  "XTS", "XUA", "XXX", "YER", "ZAR", "ZMW", "ZWG",
] as const;

const currencySet = new Set<string>(ISO_4217_CURRENCIES);

export const currencySchema = z
  .string()
  .regex(/^[A-Z]{3}$/, "Currency must be three uppercase letters")
  .refine((currency) => currencySet.has(currency), "Currency must be an ISO 4217 code");

export type Currency = z.infer<typeof currencySchema>;

export const moneySchema = z
  .object({
    amount: z.number().int().safe().nonnegative(),
    currency: currencySchema,
  })
  .strict();

export type Money = z.infer<typeof moneySchema>;

export const utcRfc3339Schema = z
  .string()
  .datetime({ offset: false })
  .refine((value) => value.endsWith("Z"), "Timestamp must be in UTC and end with Z");

export type UtcRfc3339 = z.infer<typeof utcRfc3339Schema>;

export const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const signatureAlgorithmSchema = z.enum(["ES256", "EdDSA"]);

export type SignatureAlgorithm = z.infer<typeof signatureAlgorithmSchema>;

export const signatureSchema = z
  .object({
    algorithm: signatureAlgorithmSchema,
    key_id: identifierSchema,
    value: z.string().min(16).max(4096).regex(/^[A-Za-z0-9_-]+$/),
  })
  .strict();

export type Signature = z.infer<typeof signatureSchema>;

export const correlationIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const idempotencyKeySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);
