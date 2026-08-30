# Jaguary Hackathon Decision Log

This is the concise, copy-ready export for the hackathon decision-log form. Each option is intentionally written on its own line.

## 1. Keep economic authorization outside the LLM

### DECISION

Who may produce the final decision that allows an agent purchase?

### OPTIONS CONSIDERED (ONE PER LINE)

Let the LLM authorize and call payment tools directly

Let each merchant or payment provider decide from its own payload

Use deterministic Bound Verify after the LLM proposes structured intent

### WHAT WE CHOSE

The LLM only interprets and proposes. Bound Verify is the exclusive producer of `ALLOW`, `ESCALATE`, or `DENY`.

### WHY

Money movement needs reproducible rules, stable reason codes, current revocation and usage state, and fail-closed behavior. This costs more schemas and explicit policy code than prompt-only automation, but model output or provider evidence can never silently become authority.

## 2. Reserve authority atomically in PostgreSQL

### DECISION

How should a successful policy decision become a single-use economic capability under concurrency?

### OPTIONS CONSIDERED (ONE PER LINE)

Verify first and create the reservation later

Coordinate independent services through eventual consistency

Record nonce, usage, reservation, and audit in one PostgreSQL transaction

### WHAT WE CHOSE

An `ALLOW` has economic effect only when the same transaction locks current authority, records the nonce, and creates one `RESERVED` authorization.

### WHY

Separating verification from reservation creates a race in which concurrent requests can spend the same mandate. A transactional modular monolith is less independently scalable than microservices, but it gives the hackathon's financial invariants one explainable source of truth.

## 3. Let the merchant author the checkout economics

### DECISION

Who defines the price, currency, items, quantity, expiration, and fulfillment that Bound verifies?

### OPTIONS CONSIDERED (ONE PER LINE)

Trust fields assembled by the browser

Trust the offer selected by the model

Require a canonical merchant-signed checkout

### WHAT WE CHOSE

VuelaYa creates authoritative signed checkout terms; the agent submits intent and Bound verifies the exact canonical hash and signature.

### WHY

Browser and model data are proposals, not economic truth. Merchant-authored terms prevent price or fulfillment mutation after approval. The cost is an explicit commerce adapter and signing lifecycle, which is acceptable because it makes tampering detectable and adapters replaceable.

## 4. Keep provider calls outside SQL and preserve uncertainty

### DECISION

How should payment execution handle slow calls, timeouts, and unknown provider outcomes?

### OPTIONS CONSIDERED (ONE PER LINE)

Keep a database transaction open during the provider call

Treat every timeout as failure and retry with a new key

Commit a pending attempt, call the provider outside SQL, and reconcile ambiguity

### WHAT WE CHOSE

Jaguary persists a stable idempotency identity, moves to `PAYMENT_PENDING`, performs external I/O without database locks, and treats `TIMEOUT` or `UNKNOWN` as pending rather than success or failure.

### WHY

Long transactions harm availability, while guessing after a timeout can duplicate a charge. Explicit pending state is operationally harder because it requires webhooks or polling, but it is the only honest representation of an ambiguous economic result.

## 5. Use a bounded prior mandate for autonomous fare monitoring

### DECISION

How can TravelBot buy a future matching fare without asking the customer at the exact moment inventory appears?

### OPTIONS CONSIDERED (ONE PER LINE)

Ask for confirmation only after a fare appears

Give the agent a broad reusable budget

Activate a single-use conditional mandate before monitoring

### WHAT WE CHOSE

The customer approves a revocable mandate bounded by route, date window, cabin, passengers, merchant, currency, and maximum total. Liveness activates it once; every later match still passes Verify immediately before payment.

### WHY

Fresh confirmation defeats unattended purchasing, while broad authority creates unnecessary risk. The bounded mandate accepts less flexibility—the agent cannot raise the budget or change the trip—but preserves real autonomy inside explicit human limits.

## 6. Normalize providers behind narrow adapters

### DECISION

Should OpenAI, SerpApi/Google Flights, Didit, and Yuno payloads become Jaguary's domain model?

### OPTIONS CONSIDERED (ONE PER LINE)

Pass provider payloads directly through the workflow

Build the policy model around one preferred provider

Validate and normalize each provider behind a narrow backend adapter

### WHAT WE CHOSE

OpenAI proposes structured intent, SerpApi supplies flight evidence and provenance, Didit supplies identity/liveness evidence, and Yuno implements payment execution; none of them can produce `ALLOW`.

### WHY

Normalization prevents missing or vendor-specific fields from weakening constraints and keeps providers replaceable. It adds adapter maintenance and means the current UCP/AP2-shaped vertical is not full standards conformance, a limitation the project states explicitly.

## 7. Separate the public agent operator from each customer

### DECISION

Who owns TravelBot, and who owns the authority and identity evidence for a purchase?

### OPTIONS CONSIDERED (ONE PER LINE)

Register TravelBot separately as owned by every customer

Treat the demo customer as TravelBot's global owner

Let the platform operate one public agent while customers own isolated authority

### WHAT WE CHOSE

The Jaguary platform owns TravelBot's key and build. Each authenticated customer independently owns their session, Didit assessment, conversation, mandate, credential reference, authorization, and receipt.

### WHY

Agent integrity and customer consent answer different security questions. Separating them prevents one customer's biometric evidence or credential from being reused for another and allows a single public agent to serve many customers safely.

## 8. Prefer an honest deterministic demo payment over a misleading partial integration

### DECISION

What should the deployed hackathon demo do while the real Yuno runtime path is not fully composed?

### OPTIONS CONSIDERED (ONE PER LINE)

Claim that the existence of sandbox adapter code means production payment is active

Wire an incomplete real provider path without reconciliation

Use an explicit deterministic fake while testing and documenting the Yuno adapter boundary

### WHAT WE CHOSE

The deployed demo uses `FakePaymentExecutor`; `YunoPaymentExecutor` is implemented and sandbox-tested but is not presented as the active settlement path.

### WHY

The demo can reliably prove mandates, Verify, reservation, receipt, dispute, and audit without pretending money moved. The accepted cost is reduced payment realism until credential resolution, runtime composition, authenticated webhooks, and reconciliation are production-ready.

## 9. Ground many destinations without sending a global directory to the model

### DECISION

How should TravelBot expand natural-language destination coverage without inventing airport codes or increasing every model request?

### OPTIONS CONSIDERED (ONE PER LINE)

Let the model infer any airport from memory

Send the complete global airport directory in every prompt

Resolve a curated directory deterministically and send only relevant aliases to the model

### WHAT WE CHOSE

The backend grounds 78 major airports across 72 countries, including Portuguese and English aliases, and injects only matches relevant to the sanitized conversation.

### WHY

This makes coverage predictable and testable while keeping token use proportional to the user's request. The accepted cost is directory maintenance and a primary-gateway choice for broad country names; a dedicated aviation data service is the future path for complete global coverage.
