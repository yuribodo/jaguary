import { sha256CanonicalJson, type AgentAttestationProviderPort, type CreateAssessmentInput, type ProviderAssessmentResult, type ProviderAssessmentSession, type RawProviderWebhook } from "../../contracts/v1/index.js";

export class DeterministicFakeAttestationProvider implements AgentAttestationProviderPort {
  constructor(private readonly issuedAt = new Date("2026-08-29T12:00:00.000Z")) {}
  async createAssessment(input: CreateAssessmentInput): Promise<ProviderAssessmentSession> {
    const assessmentId = `fake_${sha256CanonicalJson({ agent_id: input.agentId, principal_id: input.principalId, attestation_id: input.attestationId }).slice(0, 32)}`;
    return { provider: "fake", assessmentId, status: "PENDING", hostedUrl: `http://localhost/fake-kya/${assessmentId}` };
  }
  async getAssessment(assessmentId: string): Promise<ProviderAssessmentResult> {
    return {
      provider: "fake", assessmentId, subjectReference: `fake-subject:${assessmentId}`, status: "VERIFIED", claims: ["PRINCIPAL_IDENTITY"],
      evidenceHash: sha256CanonicalJson({ provider: "fake", assessment_id: assessmentId, status: "VERIFIED" }), providerCreatedAt: this.issuedAt,
    };
  }
  async verifyWebhook(input: RawProviderWebhook): Promise<never> { void input; throw new Error("Fake provider has no public webhook"); }
}
