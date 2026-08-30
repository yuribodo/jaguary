# Bound Trusted Surface — design system v0.2

Status: **approved direction for the first Trusted Surface**

Leading direction: **01 · Authority Letter**

## Thesis

Cryptographic authorization should be as understandable and durable as a signed document without imitating a banknote or passport. The surface is a **conversation that produces a letter of authority**: warm, editorial, precise, and verifiable.

The user should recognize, in this order:

1. which economic action is being delegated;
2. who receives authority and for which merchant;
3. which limits, validity, and scope will be signed;
4. whether the mandate is only `DRAFT`, currently `ACTIVE`, or already `REVOKED`;
5. which real evidence the API returned.

## Principles

- **Authority is the primary content.** Route, agent, merchant, amount, and validity outweigh application chrome.
- **Evidence stays visible.** IDs, hashes, algorithms, key IDs, and correlation IDs use monospace and are visually truncated only when necessary.
- **State is not decoration.** `DRAFT`, `ACTIVE`, and `REVOKED` use text, shape, and color; they never depend on color alone.
- **No decision is fabricated.** Until `POST /verify` and BE-07 reservation exist, the decision area says “not connected” and never displays a simulated `ALLOW`.
- **Conversation does not hide the agent.** TravelBot speaks in a thread, while its public verifiable identity, operator, build fingerprint, and public key remain accessible without a mascot or invented personality.

## Interaction direction · chat first

Natural-language intent is the product entry point. Conversation organizes the journey; embedded widgets make commercial facts and acts of authority inspectable. This version has no LLM or chat endpoint: a deterministic orchestrator recognizes the demo request and drives existing APIs without pretending to provide intelligence or authorization.

Primary sequence:

1. Marta describes the trip in the composer or uses the GRU → COR suggestion.
2. TravelBot reads real identity, merchant, and offer data and automatically selects the highest-ranked option.
3. The real checkout fixes commercial terms, and Marta reviews the selected flight with the requested authority.
4. TravelBot presents the complete authority letter and requests creation of a `DRAFT`.
5. A separate, explicit second gesture activates the mandate.
6. The active mandate remains in the thread with expandable details and confirmed revocation.

### Thread anatomy

- **Minimal header:** Bound, TravelBot identity, API health, and the latest correlation ID. This is not a dashboard bar.
- **Side memory:** on desktop, a 272 px sidebar contains only the current conversation and verifiable agent identity; on mobile it opens as a drawer. `Ctrl/Cmd+B` collapses it. It never invents persisted history.
- **Human message:** short, right aligned, and without a generic colored bubble.
- **Agent message:** name, timestamp, and editorial text aligned left.
- **Selected-flight widget:** a merchant-authored summary, inspired by Flighty's information hierarchy and integrated into authority review.
- **Mandate widget:** an inline document with `PROPOSAL`, `DRAFT`, `ACTIVE`, and `REVOKED` states; prior actions visibly close after transition.
- **Activity:** a discreet line of text during requests, with no chain of thought, fictional steps, or autonomy theater.
- **Composer:** an auto-growing textarea; `Enter` sends and `Shift+Enter` adds a line. It remains available to restart the flow.

### References and implementation decision

| Reference | Borrow | Avoid in this phase |
| --- | --- | --- |
| OpenAI Apps in ChatGPT | Rich interfaces appearing at the right conversational moment | Copying ChatGPT's visual chrome |
| OpenAI app permissions | Separate approval for consequential actions | Generic or implicit consent |
| OpenAI Apps SDK shopping cart | Stateful widgets that persist after action | Adding a runtime the backend does not support |
| Vercel AI Elements Conversation | Scroll viewport, autoscroll, and return-to-bottom | Download features outside P0 |
| Vercel AI Elements Prompt Input | Responsive textarea and Enter semantics | Attachments, model pickers, and unused menus |
| Vercel AI Elements Confirmation | HITL request, accepted, and rejected states | Treating activation as an ordinary button |
| assistant-ui Thread and Tool UI | Accessibility and inline tools in conversational order | Runtime dependency and premature abstraction |
| OpenAI ChatKit samples | Travel offer and server-handled action in the thread | Support sidebar and ChatKit backend |
| ChatGPT and Refero sidebars | Compact recents, flexible canvas, quiet chrome | Hiding security states or copying an achromatic identity |
| Claude conversation sidebar | New conversation, recents, and contextual actions | Projects and favorites that P0 does not have |
| shadcn Sidebar | Responsive primitive, collapse, drawer, tooltip, and shortcut | Generic dashboard navigation and team or billing menus |

Use **shadcn/base-nova** for the component system and **Vercel AI Elements** for Conversation, Message, PromptInput, Suggestion, Shimmer, and Confirmation. Application composition and responsiveness use Tailwind utilities. Global CSS contains only imports, moodboard tokens, and theme foundations. Offer and mandate remain custom domain widgets composed from shadcn and Tailwind and connected only to existing Bound APIs.

The sidebar uses the official shadcn primitive but follows conversation architecture rather than administrative navigation: `New conversation`, the GRU → COR session when it exists, and TravelBot's public identity disclosure. Without a history endpoint, “No other conversations” is an honest empty state, not a simulated list.

## Visual language

### Colors

| Role | Token | Value | Use |
| --- | --- | --- | --- |
| Paper | `--paper` | `#F4F0E7` | General background and document material |
| Raised paper | `--paper-raised` | `#FAF8F2` | Letter, ticket, and reading blocks |
| Ink | `--ink` | `#141511` | Titles, strong borders, and primary actions |
| Muted ink | `--muted` | `#5E6158` | Secondary copy and metadata |
| Cobalt | `--cobalt` | `#334DE8` | Selection, focus, and Authority Trace continuity |
| Coral | `--coral` | `#F06B52` | Revocation, errors, and broken traces |
| Verify | `--verify` | `#A9B9A5` | Valid authority and verified evidence |
| Rule | `--rule` | `rgba(20,21,17,.16)` | Dividers, perforations, and grids |

Low-contrast moodboard combinations are decorative only. Functional text maintains WCAG AA contrast.

### Typography

- **Instrument Serif:** editorial titles, routes, and authority statements.
- **Geist:** body text, buttons, and operational reading.
- **Geist Mono:** labels, serials, IDs, timestamps, hashes, and states.

Base hierarchy:

- display: `clamp(3rem, 8vw, 7rem)`, serif, tight leading;
- heading: `clamp(2rem, 4vw, 4rem)`, serif;
- body: `1rem / 1.6`, sans;
- label: `0.68rem`, uppercase mono, wide tracking;
- evidence: `0.75rem`, mono, with safe word breaking.

### Geometry and material

- Use an asymmetric editorial layout, long rules, section numbering, and generous margins.
- Letters and tickets use subtle corners, thin borders, and paper shadows—never glass or blur.
- Microcopy appears only in evidence metadata and does not compete with conversation.
- Offer and mandate use familiar tool-UI containers: border, source and state header, scannable body, and footer action.
- Hierarchy and copy distinguish commercial facts from authority, not documentary ornament.

## Signature: Authority Trace

`HUMAN → MANDATE → AGENT → CHECKOUT → PAYMENT`

- The trace begins in ink, uses cobalt for the selected segment, and ends as a dotted rule when the next stage does not exist.
- Before HTTP integration and BE-07 reservation, payment remains explicitly unavailable; the interface never jumps from checkout to `ALLOW`.
- Revocation interrupts every segment after the mandate in coral.
- On mobile, the trace becomes a vertical sequence or scrollable strip with legible labels.

## Product surfaces in this delivery

### 1. Selected flight and authorization

- A short “Bound by Jaguary” header shows real API status and the latest correlation ID.
- GRU → COR is the primary display.
- The selected flight shows route, airports, local times, duration, stops, cabin, total, and API-observed validity.
- TravelBot's passport shows real state, algorithm, key ID, and build fingerprint.

### 2. Mandate review

- Content reads like a letter: “Marta authorizes TravelBot to purchase…”.
- Complete scope is visible before creation.
- Merchant-authored checkout exposes its hash and signature without implying Bound authorization.
- The first act creates `DRAFT`; a separate second act activates the mandate.

### 3. Detail and revocation

- State and validity dominate the top.
- Signed terms, proof, and logical credential references remain legible and browser-copyable.
- Revocation requires inline confirmation and explains that authority ends, not the agent.
- Bound Verify and BE-07 use a replaceable interface and `NOT_CONNECTED` in this version.

## Product states

- **Loading:** skeletons preserve document composition and use concise `aria-live` text.
- **Empty:** explain that VuelaYa returned no GRU → COR offer and offer another query.
- **API error:** public message, retry action, and correlation ID when present.
- **API offline:** dedicated treatment without an invented correlation ID, showing the configured public URL.
- **Pending action:** disabled button, active verb, and `aria-busy` on the affected group.

## Interaction, motion, and accessibility

- Every action uses `button` or `a`, a visible cobalt focus, and at least a 44 px target.
- Tab order follows visual order and never depends on hover.
- Asynchronous feedback uses `aria-live="polite"`; errors use `role="alert"`.
- Trace reveal and seal landing last at most 420 ms and disappear under `prefers-reduced-motion`.
- Content never depends on animation, texture, color, or cursor behavior to communicate state.

## Responsiveness

- Desktop: 12-column grid; primary content spans 7–8 columns and evidence spans 4–5.
- Tablet: two balanced columns; passport moves below the offer when needed.
- Mobile: one column, full-width actions, wrapped evidence strings, and tables rendered as label-value pairs.
- Functional content never requires horizontal scrolling. The trace is the sole exception and also has an accessible text description.

## Anti-patterns

- generic dashboards, administrative sidebars, or grids of identical cards;
- fintech gradients, glassmorphism, neon, or an agent mascot;
- literal credit cards, PAN, CVV, Yuno tokens, or payment affordances;
- a “verified” badge without real API evidence;
- fictional `POST /verify`, `pay()` tools, or `ALLOW` decisions.
