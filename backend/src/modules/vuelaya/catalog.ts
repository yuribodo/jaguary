import {
  merchantCapabilitiesSchema,
  offerCandidateFixture,
  offerCandidateSchema,
  vuelaYaCapabilitiesFixture,
  type MerchantCapabilities,
  type OfferCandidate,
} from "../../contracts/v1/index.js";

export function getVuelaYaProfile(): MerchantCapabilities {
  return merchantCapabilitiesSchema.parse(vuelaYaCapabilitiesFixture);
}

export function listVuelaYaOffers(): OfferCandidate[] {
  return offerCandidateSchema.array().parse([offerCandidateFixture]);
}
