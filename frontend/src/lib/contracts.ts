export type Money = {
  amount: number;
  currency: string;
};

export type PaymentMethodSummary = {
  credential_id: string;
  network: "VISA" | "MASTERCARD" | "OTHER";
  last_four: string | null;
  label: string;
  created_at: string;
  updated_at: string;
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
  source_url?: string;
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
  flight_constraints?: {
    departure_not_before: string;
    departure_not_after: string;
    passenger_count: number;
  };
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

export type AuditEvidence = {
  event_id: string;
  correlation_id: string;
  event_type: string;
  subject_id: string;
  payload_hash: string;
  previous_hash: string | null;
  event_hash: string;
  recorded_at: string;
};

export type OrderReceipt = {
  receipt_id: string;
  order_id: string;
  checkout_id: string;
  authorization_id: string;
  payment_id: string;
  merchant_id: string;
  status: "CONFIRMED" | "CANCELLED";
  items: CommerceItem[];
  total: Money;
  fulfillment: FlightFulfillment;
  issued_at: string;
  evidence: AuditEvidence;
};

export type PurchaseDisputeEvidenceChecks = {
  receipt_ownership_verified: boolean;
  commercial_binding_verified: boolean;
  mandate_authority_verified: boolean;
  agent_identity_verified: boolean;
  payment_approved_verified: boolean;
  audit_chain_verified: boolean;
};

export type PurchaseDispute = {
  dispute_id: string;
  receipt_id: string;
  order_id: string;
  authorization_id: string;
  payment_id: string;
  principal_id: string;
  merchant_id: string;
  reason: "UNRECOGNIZED_PURCHASE";
  status: "RESOLVED";
  verdict: "AUTHORIZED" | "UNAUTHORIZED";
  liable_party: "PRINCIPAL" | "MERCHANT";
  financial_outcome: "NO_CHARGEBACK" | "CHARGEBACK_RECORDED";
  resolution_code:
    | "VALID_MANDATE_AGENT_AND_PAYMENT_EVIDENCE"
    | "AUTHORITY_EVIDENCE_INCOMPLETE";
  evidence: {
    mandate_id: string;
    agent_id: string;
    checkout_id: string;
    policy_version: string;
    amount: Money;
    original_purchase_correlation_id: string;
    checks: PurchaseDisputeEvidenceChecks;
    evidence_hash: string;
  };
  opened_at: string;
  resolved_at: string;
  audit_correlation_id: string;
};

export type AuditTimelineEvent = AuditEvidence & {
  payload: Record<string, unknown> | null;
};

export type AuditTimeline = {
  correlation_id: string;
  events: AuditTimelineEvent[];
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

export type TravelWatchMode = "ASK_BEFORE_PURCHASE" | "AUTO_PURCHASE";
export type TravelWatchStatus =
  | "AWAITING_LIVENESS"
  | "ACTIVE"
  | "CHECKING"
  | "MATCHED"
  | "EXECUTING"
  | "COMPLETED"
  | "EXPIRED"
  | "CANCELLED"
  | "FAILED";

export type TravelWatch = {
  watch_id: string;
  conversation_id: string;
  principal_id: string;
  agent_id: string;
  mode: TravelWatchMode;
  status: TravelWatchStatus;
  criteria: {
    origin_iata: string;
    destination_iata: string;
    departure_date: string;
    passenger_count: number;
    cabin: CabinClass;
    max_total_budget: Money;
  };
  criteria_hash: string;
  mandate_id: string;
  authority: {
    max_per_purchase: Money;
    max_uses: number;
    expires_at: string;
    flight_constraints: {
      departure_not_before: string;
      departure_not_after: string;
      passenger_count: number;
    };
  };
  next_check_at: string | null;
  last_checked_at: string | null;
  expires_at: string;
  attempt_count: number;
  consecutive_failures: number;
  last_outcome: "MATCH_FOUND" | "OVER_BUDGET" | "NO_INVENTORY" | null;
  nearest_miss: {
    offer_id: string;
    unit_total: Money;
    party_total: Money;
  } | null;
  matched_offer_id: string | null;
  matched_offer: OfferCandidate | null;
  receipt_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
};
