# Bound

Bound is an authorization and enforcement layer for agentic commerce. It verifies whether an agent, acting for a human, may execute an exact economic action before any payment credential is resolved or any payment is sent to a provider.

## Documentation

- [Product journey and service blueprint](docs/diagrams/bound-product-experience.html)
- [Protocol and payment model](docs/diagrams/bound-protocol-model.html)
- [Technical architecture](docs/diagrams/bound-technical-architecture.html)
- [Payment methods, credentials and purchase routes](docs/payment-methods-and-purchase-routes.md)
- [Implementation plan and team workstreams](docs/implementation-plan.md)
- [ADR-001 — MVP transactional architecture](docs/adr/ADR-001-bound-mvp-architecture.md)
- [ADR-002 — Commerce, authorization and payment protocol layering](docs/adr/ADR-002-commerce-protocol-layering.md)

## MVP sentence

> UCP gives the agent a commerce language. AP2 gives it verifiable authority. Bound enforces that authority. Yuno resolves and executes the payment.

The primary demo path is `UCP → AP2 → Bound Verify → Yuno → receipt`. Visa TAP and Visa Intelligent Commerce are complementary paths for agent recognition and payment credentials on legacy web checkouts; they are not required to complete P0.
