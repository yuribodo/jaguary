# Documentation conventions

These conventions keep the public documentation useful as the implementation changes.

## Information architecture

- `docs/technical/` explains current behavior and integration boundaries.
- `docs/adr/` records decisions that are difficult or expensive to reverse.
- `docs/diagrams/` contains visual sources for relationships and sequences.
- `docs/spikes/` records investigations and must state whether anything was adopted.
- Plans describe intended work and must not be cited as proof that a feature exists.

This follows the same separation common in mature open-source repositories: a clear entry point, task/concept/reference separation, durable ADRs, diagrams close to the architecture text, and explicit conformance/status labels.

## Required page header

Every current technical page should state:

- implementation status;
- last verification date;
- purpose/scope;
- primary code anchors;
- important limitations or conformance boundaries.

Use “implemented” only when the executable path exists. Prefer “adapter implemented; configuration required,” “normalized subset,” “spike,” or “planned” when those are more accurate.

## Code anchors

Link to stable module or contract files rather than copying large source fragments. Document behavior and invariants; let schemas and tests remain the precise field-level source of truth. When a public route, environment variable, state machine, capability, or security boundary changes, update its technical page in the same pull request.

## Diagrams

- HTML in `docs/diagrams/` is the editable source of truth.
- Every SVG needs an accessible title/description and must remain understandable without animation or color.
- One diagram should teach one dominant relationship: architecture, sequence, state, or data model.
- Keep diagrams below nine nodes or five sequence lifelines; split overview and detail instead of shrinking text.
- Use the Jaguary/Bound tokens from the local design system: warm paper, ink, cobalt focus, Geist/Geist Mono, and Instrument Serif titles.
- Explain omitted detail in the adjacent technical page.

## Terminology

- **Jaguary** — product/brand.
- **Bound** — deterministic authorization and enforcement layer.
- **TravelBot** — current shopping-agent implementation.
- **VuelaYa** — current merchant/demo adapter.
- **UCP** — commerce interoperability protocol.
- **AP2** — agent authorization/payment mandate protocol; not the roadmap priority `P2`.
- **Agent Passport** — Bound-issued short-lived identity/assurance token; not an AP2 mandate.
- **Principal** — the human/account delegating authority.

## Review checklist

Before merging documentation changes, verify that:

1. described routes, states, and environment names exist in code;
2. external protocol claims link to primary official sources;
3. current implementation and target conformance are not conflated;
4. secrets, real credentials, personal data, or raw provider payloads are absent;
5. relative links resolve from the file location;
6. diagrams pass the geometry/accessibility checks in the diagram tooling;
7. the root README or `docs/README.md` exposes any new major page.
