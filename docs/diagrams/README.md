# Bound diagrams

## Focused technical guides

- [Hackathon architecture submission](hackathon-architecture-submission.pdf) ([HTML source](hackathon-architecture-submission.html))
- [README authority rail](readme-authority-rail.html) ([SVG](readme-authority-rail.svg))
- [System context and trust boundaries](system-context.html)
- [OpenAI and TravelBot sequence](openai-travelbot-sequence.html)
- [Google Flights search through SerpApi](google-flights-search-sequence.html)
- [Didit and Trust sequence](didit-trust-sequence.html)
- [UCP checkout sequence](ucp-checkout-sequence.html)
- [AP2 and Bound authorization sequence](ap2-bound-sequence.html)

The [technical documentation index](../technical/README.md) contains the explanatory guides and conformance boundaries for every integration.

## Current implementation

- [How every part of Bound works today](bound-current-system.html) — executable architecture, frontend surfaces, TravelBot, purchasing, state lifecycles, ledger, and persistence.
- [Map of the 25 persisted objects by domain](database-domain-map.html) — complete inventory and distinction between foreign keys and logical relationships.
- [Physical schema of the authorization core](authority-database-schema.html) — columns and relationships for mandates, nonces, checkout, authorization, and payment.

## Product context and earlier decisions

- [Product journey and blueprint](bound-product-experience.html)
- [Protocol and payment model](bound-protocol-model.html)
- [Original MVP technical architecture](bound-technical-architecture.html)

The current implementation dossier is the visual source for behavior that exists in code. The final three documents preserve product context, alternatives, and architecture decisions, including work that is not connected to the runtime.
