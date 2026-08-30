# Jaguary documentation

This directory separates current behavior, operating instructions, architecture decisions, and historical planning so readers can tell what the software does today from what it may do later.

## Start here

| If you want to… | Read |
| --- | --- |
| Understand the product and its boundaries | [Technical documentation](technical/README.md) |
| See how the complete system fits together | [System architecture](technical/architecture.md) |
| Understand OpenAI, Google Flights search, Didit, UCP, or AP2 | [Integration guides](technical/README.md#integration-guides) |
| Review missing or incorrect implementation work | [Known implementation gaps](technical/known-gaps.md) |
| Run the repository locally | [Root README](../README.md#run-locally) |
| Deploy the current applications | [Deployment guide](deployment.md) |
| Understand why an architectural choice was made | [Architecture decision records](#architecture-decision-records) |
| Explore visual system maps | [Diagram index](diagrams/README.md) |

## Documentation map

- `technical/` — current, code-backed architecture and integration guides.
- `adr/` — accepted architecture decisions and their consequences.
- `diagrams/` — self-contained visual explanations. HTML is the editable source.
- `design/` — product and visual design rationale.
- `spikes/` — bounded technical investigations, not committed behavior.
- `research/` — source material and market research, not implementation truth.
- `*-plan.md` — delivery plans. A completed plan is not automatically current documentation.

## Architecture decision records

- [ADR-001 — Bound MVP architecture](adr/ADR-001-bound-mvp-architecture.md)
- [ADR-002 — Commerce protocol layering](adr/ADR-002-commerce-protocol-layering.md)
- [ADR-003 — Agent identity assurance](adr/ADR-003-agent-identity-assurance.md)
- [ADR-004 — Credential enrollment and external checkout](adr/ADR-004-credential-enrollment-and-external-checkout.md)
- [ADR-005 — TravelBot over OpenAI Agents SDK](adr/ADR-005-travelbot-agents-runtime.md)

## Maintenance standard

The rules for status labels, code anchors, diagrams, terminology, and review are in [Documentation conventions](technical/documentation-conventions.md).
