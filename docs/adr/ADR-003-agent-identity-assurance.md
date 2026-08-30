# ADR-003 — Agent identity assurance and KYA evolution

- Status: Accepted
- Date: 2026-08-29
- Scope: Bound MVP and production identity evolution
- Related: [ADR-001](ADR-001-bound-mvp-architecture.md), [ADR-002](ADR-002-commerce-protocol-layering.md)

## Context

Bound must distinguish a registered agent from a merely declared identity. Possession of a registered key, however, is not equivalent to independent certification of the operator, build, provenance, or relationship between a person and an agent.

Services such as Trulioo KYA, Experian Agent Trust, and network agent programs add external attestations, but they require commercial availability and onboarding that cannot block the hackathon's deterministic path.

## Decision

For the MVP, Bound is the operational source of agent identity. It:

- registers the public key and the relationship between an `agent_id` and the operator's `principal_id`; this operator relationship is not the identity of the customer for whom the agent buys;
- verifies request signatures, algorithms, `key_id`, validity, and build fingerprints;
- maintains `ACTIVE`, `SUSPENDED`, and `REVOKED` states;
- binds each request to its method, route, body, timestamp, and nonce;
- records audit evidence and applies replay protection during transactional reservation.

This mechanism is described as **agent identity cryptographically verified by Bound**. The demo does not claim certified KYA, Visa or Mastercard certification, or independent operator verification.

BE-14 adds a production extension through vendor-neutral interfaces: `AgentAttestationProviderPort`, `AgentTrustRepositoryPort`, and `AgentEligibilityPort`. Didit is the first real adapter and is limited to the `OPERATOR_IDENTITY` claim; it does not attest the build, key, or entire agent. Bound still produces and signs the complete binding.

The supported modes are:

- `LOCAL`: retain local cryptographic trust;
- `EXTERNAL_OPTIONAL`: record external evidence without blocking a locally valid agent;
- `EXTERNAL_REQUIRED`: require a current attestation bound to the principal, agent, key, and build.

External attestation may complement the local registry with verified operator identity, attested provenance and build fingerprints, continuous status, external revocation, and a verifiable relationship between a person, organization, and agent.

Didit is the initial provider. Trulioo, Experian, Skyfire, Vouched, and KYA.link are outside this decision. External signals are normalized evidence and never produce `ALLOW`; provider unavailability fails closed in `EXTERNAL_REQUIRED` mode.

After valid attestation, Bound issues a short-lived ES256 Agent Passport. It contains only opaque hashes and references, agent-principal-key-build bindings, audience, purpose, and expiration. Local verification checks current Bound state without calling Didit and invalidates the passport on expiration, attestation revocation, binding changes, or operational suspension and revocation.

## Consequences

- P0 does not depend on an external KYA vendor.
- Local identity proves possession of the registered key and current state, not universal reputation.
- External attestations store normalized claims, validity, and opaque hashes or references; raw provider payloads and PII are prohibited.
- External-provider failure never turns unknown identity into valid identity.
- The local registry remains necessary after adding external attestation.

## Acceptance criteria

1. No financial request relies on merely declared identity.
2. Suspended or revoked agents cannot create payable authorization.
3. Private keys never enter the registry, logs, or fixtures.
4. The interface and documentation distinguish `Bound verified` from external attestation.
5. An external provider can be added without changing mandates or receiving direct payment access.
6. Verify, mandates, TravelBot, and reservation use the same eligibility decision; reservation rereads and locks its snapshot within the transaction.
7. No external call runs inside Verify, payment, mandate, TravelBot, or a SQL transaction.

[ADR-007](ADR-007-agent-operator-and-customer-authority.md) details the separation between the agent operator and authenticated customer.
