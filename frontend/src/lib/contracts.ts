export type Money = {
  amount: number;
  currency: string;
};

export type AuditTimelineEvent = {
  event_id: string;
  correlation_id: string;
  event_type: string;
  subject_id: string;
  payload: Record<string, unknown> | null;
  payload_hash: string;
  previous_hash: string | null;
  event_hash: string;
  recorded_at: string;
};

export type AuditTimeline = {
  correlation_id: string;
  events: AuditTimelineEvent[];
};

export type AgentIdentity = {
  agent_id: string;
  principal_id: string;
  display_name: string;
  status: "ACTIVE" | "SUSPENDED" | "REVOKED";
  build_fingerprint: string;
  verification_key: {
    key_id: string;
    algorithm: "ES256";
    public_jwk: {
      kty: "EC";
      crv: "P-256";
      x: string;
      y: string;
    };
  };
  created_at: string;
};

export type MerchantCapabilities = {
  merchant_id: string;
  merchant_name: string;
  merchant_url: string;
  protocol: { name: string; version: string };
  capabilities: Array<{ name: string; version: string; extends: string[] }>;
};

export type CommerceItem = {
  item_id: string;
  name: string;
  quantity: number;
  unit_price: Money;
  total: Money;
};

export type FlightFulfillment = {
  type: "FLIGHT";
  origin: string;
  destination: string;
  departure_at: string;
  arrival_at: string;
};

export type OfferCandidate = {
  offer_id: string;
  merchant_id: string;
  merchant_url: string;
  items: CommerceItem[];
  total: Money;
  fulfillment: FlightFulfillment;
  available_until: string;
  source_url: string;
  observed_at: string;
};

export type PurchaseIntent = {
  intent_id: string;
  agent_id: string;
  merchant_id: string;
  offer_id: string;
  quantity: number;
  requested_at: string;
};

export type NormalizedCheckout = {
  terms: {
    checkout_id: string;
    merchant_id: string;
    merchant_url: string;
    items: CommerceItem[];
    total: Money;
    fulfillment: FlightFulfillment;
    created_at: string;
    expires_at: string;
    protocol: { name: string; version: string };
  };
  checkout_hash: string;
  merchant_signature: {
    algorithm: "ES256" | "EdDSA";
    key_id: string;
    value: string;
  };
};

export type CabinClass = "ECONOMY" | "PREMIUM_ECONOMY" | "BUSINESS" | "FIRST";

export type CreateMandateDraftInput = {
  mandate_id: string;
  principal_id: string;
  agent_id: string;
  allowed_merchant_ids: string[];
  allowed_merchant_categories: string[];
  route: { origin: string; destination: string };
  cabin: CabinClass;
  max_per_purchase: Money;
  max_aggregate: Money;
  max_uses: number;
  valid_from: string;
  expires_at: string;
  credential_id: string;
};

type MandateTerms = Omit<CreateMandateDraftInput, "mandate_id"> & {
  mandate_id: string;
  version: number;
  supersedes_mandate_id?: string;
};

type MandateCommon = {
  terms: MandateTerms;
  payment_credential: {
    credential_id: string;
    display: string;
  };
  created_at: string;
};

export type DraftMandate = MandateCommon & {
  status: "DRAFT";
  authority_valid: false;
};

type SignedMandate = MandateCommon & {
  terms_hash: string;
  principal_signature: {
    algorithm: "ES256" | "EdDSA";
    key_id: string;
    value: string;
  };
  activated_at: string;
  authority_valid: boolean;
};

export type ActiveMandate = SignedMandate & { status: "ACTIVE" };
export type RevokedMandate = SignedMandate & { status: "REVOKED"; revoked_at: string };
export type InactiveMandate = SignedMandate & { status: "EXPIRED" | "CONSUMED" };
export type Mandate = DraftMandate | ActiveMandate | RevokedMandate | InactiveMandate;
