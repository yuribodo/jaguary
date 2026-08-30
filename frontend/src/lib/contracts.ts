export type Money = {
  amount: number;
  currency: string;
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
  cabin: CabinClass;
  origin: string;
  destination: string;
  departure_at: string;
  arrival_at: string;
  departure_local?: string;
  arrival_local?: string;
  departure_airport_name?: string;
  arrival_airport_name?: string;
  airline_names?: string[];
  flight_numbers?: string[];
  duration_minutes?: number;
  stops?: number;
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
  source?: "GOOGLE_FLIGHTS" | "VUELAYA_DEMO";
  ranking?: "BEST" | "OTHER";
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

export type TravelBotState =
  | "COLLECTING"
  | "READY_TO_SEARCH"
  | "AWAITING_OFFER_SELECTION"
  | "AWAITING_AUTHORITY_CONFIRMATION"
  | "READY_TO_PURCHASE"
  | "EXECUTING"
  | "COMPLETED"
  | "FAILED";

export type RequiredTravelIntentField =
  | "origin_iata"
  | "destination_iata"
  | "departure_date"
  | "passenger_count"
  | "cabin"
  | "max_total_budget";

export type TravelIntent = {
  origin_iata: string | null;
  destination_iata: string | null;
  departure_date: string | null;
  passenger_count: number | null;
  cabin: CabinClass | null;
  max_total_budget: Money | null;
  selected_offer_id: string | null;
  confirmation: {
    approval_id: string;
    merchant_id: string;
    checkout_hash: string;
    amount: number;
    currency: string;
    mandate_id: string;
    decision: "CONFIRMED" | "DENIED";
    decided_at: string;
  } | null;
};

export type TravelBotMessage = {
  message_id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  sequence: number;
  correlation_id: string;
  created_at: string;
};

export type PendingTravelApproval = {
  approval_id: string;
  merchant_id: string;
  checkout_hash: string;
  amount: number;
  currency: string;
  mandate_id: string;
  status: "PENDING" | "APPROVED" | "DENIED" | "CANCELLED" | "CONSUMED";
};

export type TravelBotConversation = {
  conversation_id: string;
  principal_id: string;
  agent_id: string;
  state: TravelBotState;
  version: number;
  intent: TravelIntent;
  offers: OfferCandidate[];
  messages: TravelBotMessage[];
  active_run_id: string | null;
  operation: {
    checkout_id: string | null;
    checkout_hash: string | null;
    mandate_id: string | null;
    authorization_id: string | null;
    receipt_id: string | null;
    pending_approval: PendingTravelApproval | null;
  };
  missing_fields: RequiredTravelIntentField[];
  created_at: string;
  updated_at: string;
};
