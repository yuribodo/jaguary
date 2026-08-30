import type {
  PurchaseDisputeEvidenceChecks,
  PurchaseDisputeFinancialOutcome,
  PurchaseDisputeLiableParty,
  PurchaseDisputeResolutionCode,
  PurchaseDisputeVerdict,
} from "../../contracts/v1/index.js";

export type { PurchaseDisputeEvidenceChecks } from "../../contracts/v1/index.js";

export interface PurchaseDisputeAdjudication {
  verdict: PurchaseDisputeVerdict;
  liable_party: PurchaseDisputeLiableParty;
  financial_outcome: PurchaseDisputeFinancialOutcome;
  resolution_code: PurchaseDisputeResolutionCode;
}

export function adjudicatePurchaseDispute(
  checks: PurchaseDisputeEvidenceChecks,
): PurchaseDisputeAdjudication {
  if (!Object.values(checks).every((verified) => verified)) {
    return {
      verdict: "UNAUTHORIZED",
      liable_party: "MERCHANT",
      financial_outcome: "CHARGEBACK_RECORDED",
      resolution_code: "AUTHORITY_EVIDENCE_INCOMPLETE",
    };
  }
  return {
    verdict: "AUTHORIZED",
    liable_party: "PRINCIPAL",
    financial_outcome: "NO_CHARGEBACK",
    resolution_code: "VALID_MANDATE_AGENT_AND_PAYMENT_EVIDENCE",
  };
}
