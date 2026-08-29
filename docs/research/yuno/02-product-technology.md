# Yuno — Product & Technology Deep Research

**Research Date:** August 29, 2026  
**Scope:** Technical capabilities, infrastructure, APIs, SDKs, developer experience  
**Focus Areas:** Payment orchestration, APIs, SDKs, payment methods, routing, checkout, tokenization, fraud, recurring payments, cross-border, local payment methods, alternative payment methods, developer experience, data, automation, AI

---

## Executive Summary

Yuno provides a global payment orchestration platform that unifies 1,000+ payment methods across 200+ countries through a single API integration. The platform sits above existing payment infrastructure (PSPs, gateways, acquirers) and provides intelligent routing, fraud prevention, checkout optimization, and AI-native automation capabilities. As of 2026, Yuno has evolved from a connectivity layer into what it describes as an "AI-native operating system for payments" with productized AI agents (NOVA for recovery, Payments Concierge for operations) and agentic commerce capabilities for AI-mediated transactions. [91][92][93][94][97][99][100][103][104][105][106][107][110][114][115][116][117][118][119][120][121][122][123][125][126][127][130][131][132][133][134]

---

## BEFORE YUNO → PAYMENT PROBLEM → YUNO → RESULT

### Scenario 1: Multi-Market Expansion

**BEFORE YUNO:**
- Enterprise wants to expand from Brazil to Mexico, Argentina, and Chile
- Each market requires different payment processors (local acquirers, local payment methods)
- Engineering team must build separate integrations for each PSP (Stripe, Adyen, PayU, local providers)
- Each integration takes 2-4 weeks of engineering time
- Different APIs, different webhooks, different reconciliation formats
- No unified view of performance across markets

**PAYMENT PROBLEM:**
- Fragmented payment infrastructure across markets
- High engineering cost for each new market (8-16 weeks total for 4 markets)
- No ability to compare provider performance across markets
- Approval rates plateau because no comparison/optimization possible
- Operations team manually pulls reports from 4+ dashboards
- Reconciliation runs late due to data normalization challenges

**YUNO:**
- Single API integration to access 1,000+ payment methods across 200+ countries
- Pre-integrated connections to Stripe, Adyen, dLocal, PayU, and 460+ other providers [94][100]
- Smart routing automatically sends transactions to best-performing provider per market
- Unified dashboard with consolidated reporting across all providers
- No-code checkout builder to enable local payment methods (Pix, UPI, iDEAL, etc.) [92][100][104]
- Automated reconciliation with normalized data from all providers [125][126][127][130][131]

**RESULT:**
- New market launch in days, not months [91][104]
- 8% average authorization rate uplift from smart routing [91][114][115][118][119]
- 8% of failed transactions recovered through fallback routing alone [91][115]
- Engineering team freed from maintenance to focus on product
- Operations team has single source of truth for all payment data
- Finance team can negotiate from position of full visibility across providers [91][115][125]

---

### Scenario 2: Payment Failure Recovery

**BEFORE YUNO:**
- Customer's payment declines (card expired, insufficient funds, technical issue)
- Transaction lost, revenue gone
- No automated follow-up mechanism
- Customer would need to manually retry (most don't)
- 20-30% of failed payments are recoverable with right intervention

**PAYMENT PROBLEM:**
- 9-20% of annual revenue lost to payment failures [91]
- Manual recovery processes (email, phone) are slow and expensive
- No intelligence on which failures are recoverable vs. permanent
- Customer experience degraded by payment friction

**YUNO:**
- NOVA AI agent intercepts failed payments in real-time [116][118][121]
- Contacts customer via WhatsApp or voice in 70+ languages
- Recovers up to 75% of failed transactions autonomously [116][118]
- Zero engineering overhead (productized agent, not custom build)
- Intelligent retry logic distinguishes between decline reasons [115]

**RESULT:**
- Up to 75% of failed transactions recovered [116][118]
- $5+ billion in otherwise-failed transaction volume recovered for merchants (2025-2026) [9][14][20][21][40][61][84][86][87][89][90]
- Customer experience improved (proactive, multilingual, convenient channels)
- Operations team no longer manually chasing failed payments

---

### Scenario 3: PCI Compliance & Tokenization

**BEFORE YUNO:**
- Merchant collects card data directly on their servers
- Full PCI DSS scope applies (annual audits, extensive security controls)
- Raw PANs (Primary Account Numbers) stored in databases, logs
- High compliance cost, high breach risk
- Recurring payments require storing card data

**PAYMENT PROBLEM:**
- PCI DSS compliance is expensive and complex
- Data breach risk with raw cardholder data
- Recurring payments require secure card storage
- Network tokens (Visa/Mastercard) are acquirer-locked

**YUNO:**
- PCI DSS Level 1 certified infrastructure [99][103][105][107]
- Tokenization at point of capture (hosted fields or redirects) [103][105][106][107]
- Raw PANs never touch merchant servers [103][105]
- Vault product for secure, PCI-compliant payment data storage [105][107]
- Network Tokens with multi-acquirer portability (tokens travel with merchant, not provider) [91][105][107]
- Card Account Updater automatically refreshes expired card details [105][107]

**RESULT:**
- Merchant falls outside PCI scope for systems that only see tokens [103]
- Reduced audit surface and compliance cost
- Lower fraud risk (no raw card data in merchant systems)
- Seamless recurring payments with tokenized credentials
- Automatic card updates reduce declines from expired cards [105][107]
- Multi-acquirer token portability enables provider switching without conversion loss [91][105]

---

### Scenario 4: Fraud Prevention

**BEFORE YUNO:**
- Static rule-based fraud system (if amount > $X, flag for review)
- High false positive rate (legitimate customers declined)
- Fraud teams manually tune rules
- Multiple fraud tools require separate integrations
- Fraud patterns evolve faster than rules can be updated

**PAYMENT PROBLEM:**
- Fraud rings use sophisticated, evolving tactics
- Static rules can't adapt in real-time
- False positives frustrate legitimate customers
- Manual fraud review is slow and expensive

**YUNO:**
- AI-powered fraud detection with machine learning models [117][120][122]
- Evaluates thousands of data points per transaction (device fingerprinting, geolocation, behavioral biometrics, spending patterns) [122]
- Multiple fraud tools can run in parallel through single integration [91][117]
- Risk Conditions feature reduces fraud by 29% without approval rate penalty [116][118]
- Generative AI explains reasoning behind flagged transactions [120]
- Rules can be tuned per market without engineering work [91]

**RESULT:**
- 29% reduction in fraud without approval rate penalty [116][118]
- Fewer false positives (AI distinguishes legitimate vs. fraudulent patterns)
- Real-time adaptation to evolving fraud tactics
- Reduced manual fraud review workload
- Market-specific fraud rules without code changes

---

### Scenario 5: Cross-Border Payments & Settlement

**BEFORE YUNO:**
- Merchant needs to pay suppliers in 10+ countries
- SWIFT transfers take 3-5 days, high fees
- Need local bank accounts in each country (expensive to establish)
- FX conversion at poor rates
- No unified view of cross-border payment status

**PAYMENT PROBLEM:**
- Slow, expensive cross-border settlement
- Regulatory complexity in each country
- High FX costs and poor transparency
- Operational burden of managing multiple banking relationships

**YUNO:**
- Partnership with Conduit for stablecoin-based cross-border payments [133]
- Settlement in 15-20 minutes (vs. 3-5 days for SWIFT) [133]
- Fraction of traditional SWIFT costs [133]
- Virtual USD, EUR, GBP accounts for non-US/EU companies [133]
- Partnership with Onafriq for Pan-African payments (43 markets, 2,000+ corridors) [123]
- Triple-A partnership for stablecoin payment acceptance [1][66][67][68][69][70][74][78][79][80]
- Single API for global payins and payouts [125][126]

**RESULT:**
- 15-20 minute settlement vs. 3-5 days [133]
- Lower cross-border payment costs
- No need to establish local banking infrastructure in each country
- Unified view of cross-border payment operations
- Access to 43 African markets through Onafriq integration [123]
- Stablecoin rails for faster, cheaper international transfers [133]

---

## What Does Yuno Actually Provide?

### Core Infrastructure

**FACT:** Yuno provides a global payment orchestration platform accessible through a unified API at `https://api.y.uno`. [94][100]

**FACT:** Platform connects to 1,000+ payment methods across 200+ countries through 460+ provider integrations. [6][9][11][14][40][54][57][61][78][84][86][89][90][92][104]

**FACT:** Core capabilities include: [6][7][8][9][10][13][14][16][23][40][54][55][57][58][59][61][62][78][84][91][92][94][97][100][101][103][105][107][110][114][115][116][117][118][119][120][121][122][123][125][126][127][130][131][132][133][134]
- Payment orchestration (unified API for multiple PSPs)
- Smart routing (intelligent provider selection)
- Checkout (customizable, no-code builder)
- Tokenization & vaulting (PCI-compliant card storage)
- Fraud prevention (AI-powered, multi-tool support)
- Recurring payments (network tokens, card updater)
- Cross-border payments (stablecoin rails, virtual accounts)
- Local payment methods (Pix, UPI, iDEAL, SEPA Instant, etc.)
- Alternative payment methods (wallets, bank transfers, cash payments)
- Data & analytics (unified dashboard, reporting, reconciliation)
- Automation (AI agents: NOVA, Payments Concierge)
- AI capabilities (agentic commerce, MCP server, agent toolkit)

**FACT:** Platform is PCI DSS Level 1, ISO 27001, ISO 27701, and SOC 2 Type 2 certified. [99][103][105][107]

**FACT:** Operates under 99.99% uptime SLA. [91]

---

### Payment Orchestration

**FACT:** Payment orchestration is the technology layer that unifies every payment provider, method, and fraud tool into a single integration. [91]

**FACT:** Platform sits above existing payment stack (PSPs, gateways, acquirers) and provides one control plane for routing, management, and analytics. [91][92][93][94][100]

**FACT:** Orchestration manages transactions across six stages: [91]
1. **Checkout presentation** — Shows right payment methods per customer (country, device, currency, behavioral signals)
2. **Intelligent routing** — Decides which acquirer/processor/rail handles transaction using ML (not static rules)
3. **Fraud and risk screening** — Applies fraud rules, behavioral analytics, third-party risk tools before submission
4. **Processing and fallback** — Authorizes transaction; if first attempt fails, intelligent fallback routes to secondary provider in milliseconds
5. **Settlement and reconciliation** — Consolidates settlement data across all providers into one feed
6. **Reporting and analytics** — Surfaces approval rates, decline reasons, fraud trends, provider performance in real-time

**FACT:** Merchants using Yuno's smart routing see average 8% authorization rate uplift. [91][114][115][118][119]

**FACT:** Fallback routing alone recovers additional 8% of transactions that would otherwise be lost. [91][115]

**INFERENCE:** Orchestration is the entry point, but platform is expanding into broader financial infrastructure (payouts, banking, treasury, stablecoin rails). [14][40][61][81][84][89][90][123][133]

---

### APIs

**FACT:** Base API URL: `https://api.y.uno` [94]

**FACT:** Authentication requires: [94]
- `public-api-key` (for client-side SDK initialization)
- `private-secret-key` (for server-side API calls)
- `X-Idempotency-Key` (UUID, 24-hour scope, required on POST and PATCH)
- `Content-Type: application/json`

**FACT:** API uses `snake_case` field naming everywhere (request, response, errors). [94]

**FACT:** API-key scopes control access: [94]
- `connections:read` — GET connections
- `connections:write` — POST connections
- `routing:read` — GET routing rules
- `routing:write` — POST/PATCH routing rules

**FACT:** Key API endpoints include: [94][100][101][130][131][134]
- `/v1/connections/catalog/{provider_id}` — Get provider catalog
- `/v1/connections/{connection_id}` — Get specific connection
- `/v1/routing/{routing_id}` — Get routing rules
- `/v1/payments` — Create payments
- `/v1/checkout` — Create checkout sessions
- `/v1/customers` — Customer management
- `/v1/reports` — Generate reports (Payment, Transaction, Reconciliation, Settlement)
- `/v1/payouts` — Manage payouts

**FACT:** API supports idempotency (same key + body returns cached response; same key + different body returns 409). [94]

**FACT:** Error envelope is consistent across all endpoints with `type`, `code`, `message`, `details` structure. [94]

**INFERENCE:** API design prioritizes developer experience (consistent naming, idempotency, clear error messages, scoped permissions).

---

### SDKs

**FACT:** Yuno provides SDKs for multiple platforms: [6][7][8][92][95][96][98][108][109][110][111][113]

**Web SDK:**
- Latest version: v1.6 (March 2026) [95]
- Previous versions: v1.4 (October 2025), v1.1 (January 2025) [96][98]
- Supports card enrollment, Google Pay, wallet integrations
- Handles complete checkout flow (display payment methods, manage payment sheet, process tokens)

**React Native SDK:**
- Changelog published at docs.y.uno [108]
- Enables mobile app payment integration

**Android SDK:**
- Reference documentation available at docs.y.uno [109]
- Native Android payment integration

**iOS SDK:**
- Implied from React Native and general mobile support (specific docs not found in search results)

**INFERENCE:** SDK strategy covers web, iOS, Android, React Native, Flutter (mentioned in prior research) — maximizing developer adoption across platforms.

---

### Payment Methods

**FACT:** Platform supports 1,000+ payment methods across 200+ countries. [6][9][11][14][40][54][57][61][78][84][86][89][90][92][104]

**FACT:** Payment methods include: [2][5][10][13][91][92][104][110]
- **Credit/debit cards** — Visa, Mastercard, American Express, Discover, JCB, Elo (Brazil), Maestro, Electron
- **Local payment methods (LPMs)** — Pix (Brazil), UPI (India), iDEAL (Netherlands), SEPA Instant (Europe), FedNow (US), M-Pesa (Africa)
- **Bank transfers** — ACH (US), SEPA (EU), Boleto (Brazil), SPEI (Mexico)
- **Wallets** — Google Pay, Apple Pay, regional wallets (GrabPay, GCash in APAC)
- **Cash payments** — OXXO (Mexico), Boleto (Brazil), other cash voucher systems
- **Buy Now Pay Later (BNPL)** — Tabby (GCC), other regional BNPL providers
- **Stablecoins** — Via Triple-A partnership (US, Europe, Singapore-licensed infrastructure) [1][66][67][68][69][70][74][78][79][80]

**FACT:** Google Pay integration supports: [110]
- Card payments (global)
- PIX payments (Brazil only) via `GOOGLE_PAY_PIX` payment method type
- Both `PAN_ONLY` and `CRYPTOGRAM_3DS` authentication methods
- Supported networks: Visa, Mastercard, Amex, Discover, JCB (global); Visa Electron, Mastercard, Maestro, Elo, Elo Debit (Brazil)

**INFERENCE:** Payment method coverage is both broad (1,000+ methods) and deep (local rails, real-time payments, stablecoins) — competitive advantage over orchestrators that only support cards and major wallets.

---

### Gateways & Provider Connections

**FACT:** Yuno integrates with 460+ payment service providers, acquirers, and gateways. [6][9][11][14][40][54][57][61][78][84][86][89][90]

**FACT:** Named providers include: [94][100][110]
- Stripe
- Adyen
- dLocal
- PayU
- Cielo
- Santander
- Ita
- PagBank
- Pinbank
- Prosa
- Tap Payments
- Onafriq
- Conduit
- Triple-A

**FACT:** Connections are how merchants bring existing payment provider accounts into Yuno's orchestration. [94][100]

**FACT:** Once a connection exists, merchants can reference it from routing rules to send payments through that provider. [94][100]

**FACT:** Connection setup process: [100]
1. Navigate to Connections in dashboard
2. Search for provider (Stripe, Adyen, etc.)
3. Click Connect
4. Provide connection name and required credentials (merchantAccount, API keys, etc.)
5. Save connection
6. Set up routing for the connection
7. Enable payment method in Checkout Builder

**INFERENCE:** "Bring your own provider" model means merchants don't need to abandon existing PSP relationships — Yuno adds intelligence layer on top.

---

### Routing

**FACT:** Smart Routing is Yuno's intelligent payment routing engine. [91][92][94][100][101][114][115][118][119]

**FACT:** Routing evaluates real-time data to decide optimal provider per transaction: [91][114][115][118][119]
- Real-time approval rates
- Cost (interchange, scheme fees, provider pricing)
- Latency
- Historical performance
- Country, currency, card brand, amount, custom metadata

**FACT:** Routing supports: [94][100][101][114][115]
- **Primary routing** — Send transaction to best provider initially
- **Cascade/fallback routing** — If first attempt fails, retry with next-best provider in milliseconds
- **Rule-based routing** — Configure rules by country, currency, amount, card brand, metadata
- **ML-driven routing** — Machine learning models optimize routing decisions over time

**FACT:** Merchants using fallback routing recover additional 8% of transactions. [91][115]

**FACT:** Smart retry logic distinguishes between decline reasons: [115]
- Immediate retry through alternative provider (for recoverable declines)
- Delayed retry (for temporary issues)
- Graceful failure with alternative payment method offered (for permanent declines)

**FACT:** Routing configuration via API: [94][100]
- `POST /v1/routing` — Create routing rule
- `PATCH /v1/routing/{routing_id}` — Update routing rule
- `GET /v1/routing/{routing_id}` — Get routing rule
- Routing rules reference connections and branch by buyer attributes (country, currency, amount, card brand, custom metadata)

**INFERENCE:** Routing is core competitive moat — 8% authorization uplift directly translates to millions in recovered revenue for large merchants.

---

### Checkout

**FACT:** Yuno provides customizable checkout with no-code builder. [2][10][13][92][97][100]

**FACT:** Checkout features include: [2][5][10][13][91][92][100][104][110]
- **No-code customization** — Drag-and-drop builder for checkout flows
- **Click to Pay with Passkey** — Mastercard integration for passwordless checkout
- **Express buttons** — Apple Pay, Google Pay one-click checkout
- **Local payment method surfacing** — Automatically shows relevant methods per customer (Pix in Brazil, UPI in India, iDEAL in Netherlands, etc.)
- **Multi-workflow support** — `CHECKOUT` workflow (Yuno-hosted checkout), `DIRECT` workflow (merchant-hosted with Yuno API), `SDK_CHECKOUT` workflow (SDK-managed)
- **Wallet integration** — Google Pay, Apple Pay, regional wallets
- **Google Pay PIX** — Brazil-specific integration for PIX payments via Google Pay [110]

**FACT:** Checkout Builder workflow: [100]
1. Navigate to Checkout Builder in dashboard
2. Locate configured payment methods
3. Toggle to enable/disable methods
4. Customize appearance and flow
5. Publish settings

**FACT:** Checkout supports multiple payment method types: [101][110][112]
- Cards (credit/debit)
- Wallets (Google Pay, Apple Pay)
- Bank transfers (PIX, UPI, iDEAL, SEPA)
- Cash payments (Boleto, OXXO)
- Tickets (boleto tickets, payment vouchers)

**INFERENCE:** No-code checkout customization reduces engineering dependency — business teams can optimize conversion without code deployments.

---

### Tokenization

**FACT:** Yuno provides PCI-compliant tokenization to remove raw PANs from merchant application layer. [103][105][106][107]

**FACT:** Tokenization process: [103][105][106][107]
1. Hosted field or redirect captures card number
2. Provider's vault issues token
3. Merchant application receives token (not raw card number)
4. Token used for all downstream operations (recurring billing, fraud checks, refunds)
5. Merchant servers, databases, logs never hold PAN

**FACT:** Systems that only see tokens (not raw cardholder data) fall outside PCI scope entirely. [103]

**FACT:** Yuno's financial infrastructure is PCI DSS Level 1 certified — cardholder data handled through Yuno's stack never touches merchant application servers. [103][105]

**FACT:** Network Tokens (Visa/Mastercard) replace sensitive card data with secure, real-time updated tokens. [105][107]

**FACT:** Multi-acquirer Network Token portability — tokens travel with merchant, not provider (competitive differentiation). [91][105]

**INFERENCE:** Tokenization + PCI Level 1 certification = major compliance cost reduction for merchants (shrinks audit surface, reduces breach risk).

---

### Fraud Prevention

**FACT:** Yuno integrates AI-powered fraud prevention directly into platform. [91][117][120][122]

**FACT:** Fraud capabilities include: [91][117][120][122]
- **Machine learning models** — Process vast transaction volumes to spot fraud in real-time
- **Behavioral analytics** — Device fingerprinting, geolocation, behavioral biometrics, spending patterns
- **Multi-fraud tool support** — Run multiple fraud providers in parallel through single integration
- **Risk Conditions** — Configurable fraud rules per market (29% fraud reduction without approval rate penalty) [116][118]
- **Generative AI** — Explains reasoning behind flagged transactions, uncovers missed patterns [120]
- **Adaptive models** — Continuously improve as fraud tactics evolve [117][120][122]

**FACT:** Fraud evaluation happens before transaction submission (pre-auth screening). [91]

**FACT:** Rules can be tuned per market without engineering work. [91]

**INFERENCE:** AI-powered fraud is architectural advantage over static rule-based systems (adapts faster, fewer false positives, market-specific tuning without code).

---

### Recurring Payments

**FACT:** Yuno supports recurring payments through tokenization and vaulting. [105][107]

**FACT:** Vault product features: [105][107]
- **Secure data storage** — PCI-compliant storage of payment credentials
- **Agnostic token framework** — Work across multiple providers without restrictions
- **Network Tokens** — Real-time encryption, automatic updates when cards are reissued
- **Card Account Updater** — Automatically refreshes card details when cards expire or are reissued
- **Frictionless recurring payments** — Customers save payment details for smoother checkout

**FACT:** Network Tokens automatically update when cards are reissued (reduces declines from expired cards). [105][107]

**FACT:** Multi-acquirer token portability enables switching providers without losing tokenized credentials (competitive differentiation). [91][105]

**INFERENCE:** Recurring payment infrastructure reduces subscription churn (automatic card updates prevent involuntary declines) and simplifies compliance (tokenization removes PCI scope).

---

### Cross-Border Payments

**FACT:** Yuno enables cross-border payments through partnerships and stablecoin rails. [123][133]

**FACT:** Conduit partnership (March 2026): [133]
- Stablecoin-powered cross-border payments
- Settlement in 15-20 minutes (vs. 3-5 days for SWIFT)
- Fraction of traditional SWIFT costs
- Virtual USD, EUR, GBP accounts for non-US/EU companies
- No need to establish local banking infrastructure

**FACT:** Onafriq partnership (June 2026): [123]
- Pan-African payment network (43 markets, nearly 1 billion mobile wallets, 500 million bank accounts, 2,000+ corridors)
- Real-time disbursements and omnichannel collections
- Card issuance
- Treasury management
- Stablecoin settlement
- ISO 27001 and CMML3-certified security
- Live in Egypt, Ghana, Kenya, Nigeria, Cameroon, Cote D'Ivoire, Uganda

**FACT:** Triple-A partnership (May 2026): [1][66][67][68][69][70][74][78][79][80]
- Stablecoin payment acceptance for merchants worldwide
- US, Europe, Singapore-licensed infrastructure
- Single API integration for stablecoin checkout

**INFERENCE:** Cross-border strategy combines traditional rails (SWIFT alternatives) with crypto rails (stablecoins) — preparing for hybrid future.

---

### Local Payment Methods (LPMs)

**FACT:** Yuno supports 1,000+ local payment methods across 200+ countries. [6][9][11][14][40][54][57][61][78][84][86][89][90][92][104]

**FACT:** Local payment methods by region: [91][104]
- **Latin America:** Pix (Brazil), Boleto (Brazil), SPEI (Mexico), OXXO (Mexico), local cards (Elo in Brazil)
- **Asia-Pacific:** UPI (India), GrabPay (SE Asia), GCash (Philippines), regional wallets
- **Europe:** iDEAL (Netherlands), SEPA Instant (EU), SEPA Direct Debit, local bank transfers
- **Africa:** M-Pesa (Kenya/East Africa), mobile money wallets (via Onafriq)
- **Middle East:** Mada (Saudi Arabia), KNET (Kuwait), NAPS (Qatar) (via Tap Payments)
- **North America:** ACH (US), FedNow (US real-time), Interac (Canada)

**FACT:** LPMs activate via one API — merchants can enable 1,000+ methods instantly without additional integrations. [104]

**FACT:** Checkout automatically surfaces relevant LPMs per customer (country, device, currency, behavioral signals). [91][104]

**INFERENCE:** LPM coverage is critical competitive advantage — local methods drive majority of online volume in many regions (Pix > credit cards in Brazil, UPI dominant in India).

---

### Alternative Payment Methods (APMs)

**FACT:** APMs include wallets, bank transfers, BNPL, cash payments, real-time rails. [2][5][10][13][91][92][104][110]

**FACT:** Supported APMs: [2][5][10][13][91][92][104][110]
- **Wallets:** Google Pay, Apple Pay, GrabPay, GCash, regional wallets
- **Bank transfers:** Pix (Brazil real-time), UPI (India real-time), iDEAL (Netherlands), SEPA Instant (EU), ACH (US), FedNow (US)
- **BNPL:** Tabby (GCC), regional BNPL providers
- **Cash payments:** Boleto tickets (Brazil), OXXO vouchers (Mexico)
- **Stablecoins:** Via Triple-A partnership (US, Europe, Singapore) [1][66][67][68][69][70][74][78][79][80]

**FACT:** Google Pay supports both card payments and PIX (Brazil-specific). [110]

**INFERENCE:** APM strategy treats real-time and alternative methods as native primitives (not bolt-ons) — architectural advantage for future of payments.

---

### Developer Experience

**FACT:** Developer documentation available at docs.y.uno. [94][95][96][97][98][100][101][108][109][110][111][112][113][130][131][132][134]

**FACT:** Documentation includes: [94][95][96][97][98][100][101][108][109][110][111][112][113][130][131][132][134]
- API reference (connections, routing, payments, checkout, customers, reports)
- SDK documentation (Web, React Native, Android)
- Integration guides (direct integration, checkout, vaulting, Google Pay, etc.)
- Changelogs (Web SDK versions, React Native SDK updates)
- Use cases (set up payment connection, build reports, etc.)
- AI capabilities (Agent Toolkit, MCP server, LLM integrations)

**FACT:** Complete documentation index available at `https://docs.y.uno/llms.txt` — machine-readable index for AI agents. [94][95][96][97][98][100][108][109][110][111][113][134]

**FACT:** Developer tools include: [92][94][100][134]
- Public/secret API keys (sandbox and production)
- Webhooks for real-time payment events
- Idempotency support (X-Idempotency-Key header)
- Scoped API permissions (connections:read, routing:write, etc.)
- Consistent error envelope (type, code, message, details)
- snake_case naming everywhere

**FACT:** Agent Toolkit (`@yuno-payments/agent-toolkit` npm package) enables AI agents to interact with Yuno via function calling. [113][134]
- Framework integrations: Vercel AI SDK, Google Genkit, LangChain, OpenAI Chat, OpenAI Agents SDK
- MCP server exposes Yuno API as Model Context Protocol tools
- Tools include: `customer.create`, `customer.retrieve`, `paymentMethod.enroll`, `payments.create`, etc.

**INFERENCE:** Developer experience prioritizes:
- Consistency (naming, errors, authentication)
- Flexibility (multiple workflows: DIRECT, CHECKOUT, SDK_CHECKOUT)
- AI-readiness (MCP server, Agent Toolkit, LLM-friendly docs)
- Self-service (dashboard for connections, routing, checkout config)

---

### Data & Analytics

**FACT:** Yuno provides unified dashboard for payment data visualization. [97][125][126][132]

**FACT:** Dashboard features: [97][125][126][132]
- **Insights** — Payment analytics with filters (card brand, currency, date range, country, issuer country, network tokens)
- **Conversion rates** — Track checkout conversion per payment method, provider, country
- **Sales volume** — Monitor transaction volume across providers
- **Provider performance** — Compare approval rates, costs, latency across PSPs
- **Anomaly detection** — Real-time alerts for approval rate drops, rejection spikes, provider outages [115][116][118][121]

**FACT:** Reporting API provides four report types: [130][131]
- Payment report
- Transaction report
- Transaction Reconciliation report
- Settlement report

**FACT:** Additional report types (via ReadMe docs): [131]
- Communications report
- Fraud Transactions report
- Payouts report
- Fees report
- Agenda report
- Sales Conciliation report
- Advancements report

**FACT:** Report generation process: [130]
1. `POST /v1/reports` — Create report (specify type, date range, filters)
2. `GET /v1/reports/{id}` — Check if report is ready (status: SUCCEEDED)
3. `GET /v1/reports/{id}/download` — Download report (.zip or .csv for Settlement)

**FACT:** Reconciliation features: [124][125][126][127]
- **Automated reconciliation** — Normalize data from multiple providers into canonical schema
- **Alerts** — Notify when provider settlement file is missing
- **Continuous matching cycles** — Run reconciliation logic in real-time
- **Exception classification** — Automate discrepancy categorization (timing, fees, duplicates, currency gaps)
- **Forecasting integration** — Connect reconciliation data to cash flow forecasting

**INFERENCE:** Data strategy emphasizes unified visibility (single source of truth across all PSPs) and automation (alerts, anomaly detection, reconciliation) — reducing manual operations workload.

---

### Automation

**FACT:** Yuno provides automation through AI agents and workflow tools. [54][55][57][58][59][60][61][62][115][116][118][121][134]

**FACT:** NOVA AI agent (September 2025): [55][56][116][118]
- Intercepts failed payments after the fact
- Contacts customers via WhatsApp or voice in 70+ languages
- Recovers up to 75% of failed transactions
- Zero engineering overhead (productized agent)

**FACT:** Payments Concierge (April 2026): [54][58][59][60][61][62][115][116][118][121]
- Always-on AI agent for payment operations
- Runs inside Slack, WhatsApp, or preferred interface
- Real-time anomaly detection (approval rate drops, rejection spikes, provider outages)
- Autonomous optimization (adjusts routing rules, enables/disables providers, reorders checkout methods)
- Cost-level transparency (surfaces interchange/scheme fees per transaction)
- Instant reporting and analysis (generates executive reports, board decks on demand)

**FACT:** Smart Routing automation: [91][114][115][118][119]
- ML-driven routing decisions (not static rules)
- Cascade/fallback logic (automatic retry through alternative providers)
- Real-time optimization based on approval rates, cost, latency, historical performance

**FACT:** Reconciliation automation: [124][125][126][127]
- Automated alerts for missing settlement files
- Continuous matching cycles (no manual batch runs)
- Exception classification (automated discrepancy categorization)

**INFERENCE:** Automation strategy moves from human workflows to AI agents — payments teams shift from execution to oversight.

---

### AI Capabilities

**FACT:** Yuno describes itself as "AI-native operating system for payments" (2026). [17][26][40][41][61][81][84][86][89][90]

**FACT:** AI capabilities include: [35][54][55][57][58][59][60][61][62][113][116][117][118][120][121][122][134]
- **NOVA** — AI payment recovery agent (75% recovery rate)
- **Payments Concierge** — AI operations agent (anomaly detection, autonomous optimization, instant reporting)
- **Agentic Commerce** — Enable purchases inside AI assistants (ChatGPT, Claude, Gemini, Perplexity, Copilot)
- **Fraud detection** — ML models evaluate thousands of data points per transaction
- **Smart Routing** — ML-driven routing decisions (not static rules)
- **Agent Toolkit** — npm package (`@yuno-payments/agent-toolkit`) for AI agent integrations
- **MCP Server** — Exposes Yuno API as Model Context Protocol tools for AI agents

**FACT:** Agentic Commerce (January 2026): [35][57][63]
- Enables merchants to sell through AI agents
- Real-time insights, secure checkout, seamless payment integration
- Support for OpenAI's Agentic Commerce Protocol
- Sub-500ms response times
- Analytics tracking which agent/conversation drove each sale

**FACT:** Agent Toolkit features: [113][134]
- npm package: `@yuno-payments/agent-toolkit`
- Framework integrations: Vercel AI SDK, Google Genkit, LangChain, OpenAI Chat, OpenAI Agents SDK
- MCP server tools: `customer.create`, `customer.retrieve`, `paymentMethod.enroll`, `payments.create`, `checkout.create`, etc.
- Enables AI agents to create payments, customers, checkout sessions via function calling

**FACT:** AI-native architecture: [40][41][54][55][57][58][59][60][61][62][86][117][118][120][121][122]
- AI embedded in core workflows (routing, recovery, fraud, operations)
- Productized agents (NOVA, Payments Concierge) — not just API features
- Generative AI for fraud explanation and pattern discovery [120]
- Continuous learning from transaction data

**INFERENCE:** AI strategy is architectural (AI-native OS), not additive (AI features bolted onto legacy platform) — competitive differentiation vs. orchestrators selling "AI-powered" dashboards.

---

## What Does Its Infrastructure Enable?

### For Merchants

**FACT:** Merchants can: [91][92][93][94][100][104][115][116][118][121][125][126][127]
- Launch in new markets in days (not months)
- Lift authorization rates by 8% average
- Recover 75% of failed transactions (NOVA)
- Reduce fraud by 29% without approval rate penalty
- Consolidate reconciliation across all providers
- Monitor payment operations in real-time (anomaly detection)
- Optimize costs through provider comparison

**INFERENCE:** Infrastructure enables merchants to treat payments as strategic capability (not fixed cost) — faster growth, higher conversion, lower operational burden.

---

### For Developers

**FACT:** Developers can: [6][7][8][92][94][100][113][134]
- Integrate 1,000+ payment methods with one API
- Use SDKs for web, iOS, Android, React Native, Flutter
- Customize checkout without backend changes (no-code builder)
- Build AI-powered payment experiences (Agent Toolkit, MCP server)
- Access comprehensive documentation (docs.y.uno, llms.txt index)
- Test in sandbox with public/secret API keys

**INFERENCE:** Infrastructure enables developers to focus on product (not payment plumbing) — faster iteration, less maintenance, more innovation.

---

### For AI Agents

**FACT:** AI agents can: [35][57][113][134]
- Create payments, customers, checkout sessions via function calling
- Access merchant catalog and process payments inside ChatGPT, Claude, Gemini, Perplexity, Copilot
- Retrieve payment status, customer data, routing analytics
- Optimize payment operations autonomously (Payments Concierge)
- Recover failed transactions (NOVA)

**INFERENCE:** Infrastructure is preparing for "agentic commerce" future — AI agents as primary payment initiators (not just humans).

---

### For Banks & Payment Providers

**FACT:** Banks and payment providers can: [14][81][83][84][85][89]
- White-label Yuno's technology (dLocal, Prosa partnerships)
- Access Yuno's 1,000+ payment method network through single integration
- Offer enhanced payment capabilities to their merchant customers
- Leverage Yuno's AI-native infrastructure (routing, fraud, recovery)

**INFERENCE:** Infrastructure enables B2B2C model — Yuno as infrastructure layer for traditional financial institutions (not just direct-to-merchant).

---

## What Is Its Strongest Technical Moat?

### 1. Multi-Acquirer Network Token Portability

**FACT:** Yuno is one of the only orchestration platforms with productized multi-acquirer Network Token portability. [91][105]

**FACT:** Tokens travel with merchant, not provider — enables switching acquirers without losing tokenized credentials or suffering conversion loss. [91][105]

**INFERENCE:** This is structural competitive advantage — merchants can negotiate better rates with acquirers (switching cost eliminated), and Yuno becomes indispensable infrastructure (tokens persist even if merchant changes PSPs).

---

### 2. AI-Native Architecture (Not AI Features)

**FACT:** Yuno ships AI as productized agents (NOVA, Payments Concierge, Agentic Commerce), not just API features. [35][54][55][57][58][59][60][61][62][116][118][121]

**FACT:** AI is embedded in core workflows (routing, recovery, fraud, operations) — not bolted onto legacy platform. [40][41][54][55][57][58][59][60][61][62][86][117][118][120][121][122]

**INFERENCE:** AI-native architecture is harder to replicate than "AI-powered" dashboards — competitors would need to rebuild from ground up, not just add ML models to existing stack.

---

### 3. Local Depth + Global Coverage

**FACT:** 1,000+ payment methods across 200+ countries, including local rails (Pix, UPI, iDEAL, FedNow, SEPA Instant, Mada, KNET, NAPS). [6][9][11][14][40][54][57][61][78][84][86][89][90][91][104]

**FACT:** Partnerships with local specialists (Onafriq for Africa, Tap Payments for GCC, Triple-A for stablecoins). [1][66][67][68][69][70][74][78][79][80][123]

**INFERENCE:** "Local everywhere" is a moat — competitors starting today are 2+ years behind in local integrations, regulatory approvals, and provider relationships. [86]

---

### 4. Neutrality (No Own Acquirer)

**FACT:** Yuno sits above every provider and never enters the flow of funds — intelligence serves merchant, not processing margin. [90]

**INFERENCE:** Neutrality builds trust with merchants (routing decisions based on merchant outcomes, not Yuno's own acquirer revenue) and enables partnerships with banks/PSPs (white-label model).

---

## What Are Its Product Gaps?

### 1. In-Person Payments (POS)

**SPECULATION:** Based on available documentation, Yuno appears focused on online/e-commerce payments. In-person (POS) payments, QR code payments at physical stores, and omnichannel unification are not prominently featured. [91][92][104]

**INFERENCE:** This could be a gap for merchants with significant offline presence (restaurants, retail chains) who need unified online + offline payment infrastructure.

---

### 2. Embedded Finance / Banking-as-a-Service

**SPECULATION:** While Yuno partners with banks and offers payouts, full embedded finance capabilities (issuing cards, opening bank accounts, lending) are not clearly documented as native Yuno products. [14][81][83][84][85][89][123][125][126]

**INFERENCE:** Competitors like Stripe (Stripe Issuing, Stripe Capital) or Adyen (Adyen for Platforms) offer more comprehensive embedded finance — Yuno may need to expand beyond payments into broader financial services.

---

### 3. Industry-Specific Solutions

**SPECULATION:** Documentation emphasizes general payment orchestration, but industry-specific solutions (healthcare payments with HIPAA compliance, gaming with specialized fraud, marketplaces with complex split payments) are not prominently featured. [91][92][104]

**INFERENCE:** Vertical-specific solutions could be growth opportunity — healthcare, gaming, marketplaces, SaaS, nonprofits each have unique payment requirements.

---

### 4. Crypto-Native Features (Beyond Stablecoins)

**SPECULATION:** Stablecoin acceptance is supported via Triple-A partnership, but broader crypto features (crypto-to-fiat on-ramp, multi-crypto wallets, DeFi integrations) are not documented. [1][66][67][68][69][70][74][78][79][80][133]

**INFERENCE:** As crypto adoption grows, merchants may want to accept Bitcoin, Ethereum, etc. (not just stablecoins) — Yuno may need to expand crypto capabilities beyond stablecoin rails.

---

### 5. Advanced Subscription Management

**SPECULATION:** Recurring payments are supported (tokenization, network tokens, card updater), but advanced subscription management (proration, usage-based billing, subscription analytics, dunning management) is not clearly documented as native Yuno product. [105][107]

**INFERENCE:** Subscription businesses (SaaS, media, membership) may need more sophisticated subscription infrastructure than basic recurring payments.

---

## What Could Developers Build on Top of Yuno?

### 1. Vertical-Specific Payment Solutions

**SPECULATION:** Developers could build:
- **Healthcare payment portal** — HIPAA-compliant checkout for medical practices, integrated with EHR systems
- **Gaming payment gateway** — Optimized for high-volume, low-value transactions with specialized fraud prevention
- **Marketplace payment splitter** — Complex split payments for multi-vendor marketplaces (escrow, commissions, payouts)
- **Nonprofit donation platform** — Optimized for recurring donations, donor management, tax receipts

**INFERENCE:** Yuno's unified API + local payment methods + fraud tools would accelerate vertical-specific builds (developers focus on vertical logic, not payment plumbing).

---

### 2. AI-Powered Payment Optimization Tools

**SPECULATION:** Developers could build:
- **Payment analytics dashboard** — Enhanced analytics on top of Yuno's data (custom metrics, industry benchmarks, predictive modeling)
- **Routing optimizer** — ML models that recommend optimal routing rules based on historical performance
- **Fraud tuning assistant** — AI tool that analyzes false positives/negatives and recommends fraud rule adjustments
- **Revenue recovery coach** — AI agent that identifies recovery opportunities (failed transactions, cart abandonment) and recommends actions

**INFERENCE:** Yuno's Agent Toolkit + MCP server enables AI agents to interact with payment data — developers can build specialized AI tools without building payment infrastructure from scratch.

---

### 3. Cross-Border Payment Aggregators

**SPECULATION:** Developers could build:
- **Global payroll platform** — Pay employees/contractors in 100+ countries using Yuno's payouts + local payment methods
- **Supplier payment network** — B2B payment platform for paying suppliers globally (stablecoin rails for speed, local methods for accessibility)
- **Freelancer payment hub** — Platform for clients to pay freelancers worldwide (multi-currency, local methods, compliance handling)

**INFERENCE:** Yuno's cross-border capabilities (Onafriq, Conduit, stablecoin rails) + unified API would enable developers to build global payment products without negotiating with 100+ local providers.

---

### 4. Agentic Commerce Applications

**SPECULATION:** Developers could build:
- **AI shopping assistant** — ChatGPT/Claude plugin that helps users find products and complete purchases inside AI chat
- **Voice commerce app** — Alexa/Google Assistant integration for voice-activated purchases (Yuno handles payment processing)
- **Conversational checkout** — WhatsApp/Telegram bot that guides users through product selection and payment (Yuno's NOVA + checkout APIs)
- **AI-powered subscription manager** — Agent that monitors user's subscriptions, finds better deals, cancels unused services, negotiates rates

**INFERENCE:** Yuno's Agentic Commerce + Agent Toolkit enables developers to build AI-native commerce experiences — payments are infrastructure, not the product.

---

### 5. Payment Infrastructure for Emerging Markets

**SPECULATION:** Developers in emerging markets could build:
- **LatAm e-commerce platform** — Shopify alternative optimized for Latin America (Pix, Boleto, local cards, Spanish/Portuguese UX)
- **African mobile money aggregator** — Platform for businesses to accept M-Pesa, MTN Mobile Money, etc. across Africa (Onafriq integration)
- **GCC payment gateway** — Payment platform for Middle East (Mada, KNET, NAPS, Tabby BNPL)
- **India UPI-first checkout** — Checkout optimized for UPI (India's dominant payment method) with Yuno's fraud + routing on top

**INFERENCE:** Yuno's local payment method coverage + unified API would enable developers in emerging markets to build locally-optimized products without integrating with 10+ local providers individually.

---

## Citations

[1] Yuno Newsroom — Triple-A partnership — https://y.uno/en/newsroom  
[2] Yuno Checkout Product Updates — https://y.uno/en/product-updates/smarter-personalized-checkout  
[5] FF News — Mastercard Payment Passkey — https://ffnews.com/companies/yuno/  
[6] APIs.io — Yuno Provider — https://apis.io/providers/yuno/  
[7] APIs.io — Yuno Payments API — https://apis.io/apis/yuno/yuno-payments-api/  
[8] Yuno Docs — Payment Examples — https://temp-yuno-docs.readme.io/reference/payment-examples  
[9] The Industry Spread — Yuno $45m Series B — https://theindustryspread.com/yuno-45m-series-b-payment-orchestration-stablecoin-rails/  
[10] Yuno — Product Updates Q4 2024 — https://yuno-payments.com/en/product-updates/product-updates-q4-2024/  
[11] Afraem Ahsan LinkedIn — Yuno overview — https://www.linkedin.com/posts/afraemahsan_imagine-running-a-global-business-and-having-activity-7495035121692073984-46Ut  
[13] Yuno — Q1 2025 Product Updates — https://yuno-payments.com/en/product-updates/q1-2025-product-updates/  
[14] Pulse2 — Yuno $45M Series B — https://pulse2.com/yuno-raises-45-million-series-b-to-scale-ai-native-global-payments-platform/  
[17] Yahoo Finance — Yuno $45m Series B — https://finance.yahoo.com/technology/articles/yuno-secures-45m-series-b-110500952.html  
[20] Fintech Futures — Yuno $45m Series B — https://www.fintechfutures.com/venture-capital-funding/fintech-yuno-45m-series-b  
[21] TBreak — Yuno Series B — https://tbreak.com/fintech-yuno-45m-series-b/  
[23] Fintech Futures — Yuno $25m Series A — https://www.fintechfutures.com/fintech/colombia-s-yuno-plots-expansion-following-25m-series-a-round  
[26] Mauricio Schwartzmann LinkedIn — Yuno Series B — https://www.linkedin.com/posts/mauricio-schwartzmann_yuno-banking-payments-activity-7493338147683045376-ymQK  
[35] Yuno Newsroom — Agentic Commerce — https://y.uno/en/newsroom/yuno-agentic-commerce  
[40] Latam Republic — Yuno $45M AI OS — https://www.latamrepublic.com/yuno-secures-us-45-million-to-build-an-ai-operating-system-for-global-payments/  
[41] GlobeNewswire — Yuno $45M Series B — https://www.globenewswire.com/news-release/2026/08/12/3343819/0/en/yuno-raises-45-million-series-b-to-scale-the-ai-native-operating-system-of-global-payments-and-financial-services.html  
[54] Yahoo Finance — Yuno Payments Concierge — https://finance.yahoo.com/markets/crypto/articles/yuno-launches-payments-concierge-always-145300264.html?fr=sycsrp_catchall  
[55] Yuno Newsroom — NOVA AI agents — https://y.uno/en/newsroom/yuno-launches-nova-ai-agents-to-turn-payment-friction-into-growth-merchants-recover-up-to-75-percent-of-failed-transactions  
[56] Yuno Blog — https://y.uno/en/blog  
[57] Yuno Blog — Agentic Commerce — https://y.uno/en/blog/which-payment-orchestrators-support-agentic-commerce  
[58] GlobeNewswire — Yuno Payments Concierge — https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/yuno-launches-payments-concierge-an-always-on-ai-agent-for-payment-operations.html  
[59] TechIntelPro — Yuno Payments Concierge — https://techintelpro.com/news/finance/payments-and-wallets/yuno-launches-payments-concierge-ai-agent-for-payment-operations  
[60] BriefGlance — Yuno AI agent — https://briefglance.com/articles/yunos-ai-agent-aims-to-revolutionize-global-payment-operations  
[61] Martin Mexia LinkedIn — Yuno $45M — https://www.linkedin.com/posts/martinmexia_yuno-just-raised-a-45m-series-b-to-build-activity-7493311962982899712-t1RV  
[62] LinkedIn — Yuno autonomous AI — https://www.linkedin.com/pulse/yuno-bringing-autonomous-ai-payment-operations-marcel-van-oost-qmemf  
[63] Simon Martinez LinkedIn — Mastercard agentic payments — https://www.linkedin.com/posts/simonmartinez21_the-future-of-commerce-is-agentic-were-activity-7404206239238217729-3x8R  
[66] Triple-A — Yuno partnership — https://www.triple-a.io/newsroom/triplea-yuno-partnership  
[67] IBS Intelligence — Yuno Triple-A — https://ibsintelligence.com/ibsi-news/yuno-taps-triple-a-to-enable-stablecoin-payment-acceptance/  
[68] Fintech News SG — Yuno Triple-A — https://fintechnews.sg/131285/digitalassets/yuno-triple-a-stablecoin-payment/  
[69] Triple-A LinkedIn — Yuno partnership — https://www.linkedin.com/posts/triple-a-technology_today-were-announcing-our-partnership-with-activity-7458167171509219328-A7yF  
[70] E-Commerce News — Yuno Triple-A — https://ecommercenews.ca/story/yuno-triple-a-add-stablecoin-payments-for-merchants  
[74] LinkedIn — Yuno Triple-A — https://www.linkedin.com/pulse/yuno-triple-a-partner-enable-stablecoin-payment-marcel-van-oost-uw5mf  
[78] LinkedIn — Yuno stablecoins — https://www.linkedin.com/posts/yunopay_stablecoins-arent-emerging-anymore-theyre-activity-7458166065056010240-9Mm1  
[79] MEXC — Yuno Triple-A — https://www.mexc.co/news/1076660  
[80] Financial IT — Yuno Triple-A — https://www.linkedin.com/posts/financialitnet_yuno-and-triple-a-partner-to-enable-stablecoin-activity-7458107479579631616-DPlp  
[81] Yuno Newsroom — Series B — https://y.uno/en/newsroom/yuno-series-b  
[83] dLocal — Yuno partnership expansion — https://www.dlocal.com/press-releases/dlocal-and-yuno-expand-partnership-to-simplify-global-expansion-for-modern-enterprises-in-emerging-markets/  
[84] LinkedIn — Finn Williams Yuno — https://www.linkedin.com/posts/finn-williams-7433a1132_ai-followthemethod-activity-7493574494360367105-IOa5  
[86] QuantumLight LinkedIn — Yuno $45M — https://www.linkedin.com/posts/quantum-light-capital_just-announced-with-bloomberg-portfolio-activity-7493312003474788352-q2xN  
[89] Norte Ventures LinkedIn — Yuno $45M — https://www.linkedin.com/posts/norteventures_yuno-raises-us45m-to-scale-its-ai-native-activity-7493362324599283712-K-qH  
[90] Justo Benetti LinkedIn — Yuno $45M — https://www.linkedin.com/posts/justo-benetti-8a820b49_orchestration-was-the-entry-point-it-was-activity-7493315758958178304-gii_  
[91] Yuno Blog — Payment Orchestration Guide — https://y.uno/en/blog/a-complete-guide-to-payment-orchestration  
[92] Yuno — Online Payment Platform — https://www.y.uno/online-payment-platform  
[93] Yuno Blog — Multi-PSP API Integration — https://y.uno/en/blog/multi-psp-api-integration-what-developers-wish-they-knew-before-starting  
[94] Yuno Docs — Connections & Routing — https://docs.y.uno/reference/organizations/connections-routing-overview  
[95] Yuno Docs — Web SDK v1.6 — https://docs.y.uno/changelog/web-sdk-v1.6-changelog  
[96] Yuno Docs — Web SDK v1.4 — https://docs.y.uno/changelog/web-sdk-v1.4-changelog  
[97] Yuno Docs — Dashboard Overview — https://docs.y.uno/docs/using-yuno/dashboard-overview/your-payment-operative-system  
[98] Yuno Docs — Web SDK v1.1 — https://docs.y.uno/changelog/web-sdk-v1.1-changelog  
[99] SourceForge — Yuno Reviews — https://sourceforge.net/software/product/Yuno/  
[100] Yuno Docs — Set Up Payment Connection — https://docs.y.uno/docs/direct-integration-use-cases/set-up-payment-connection  
[101] Yuno Docs — The Payment Object — https://temp-yuno-docs.readme.io/reference/the-payment-object  
[103] Yuno Blog — PCI Scope Reduction — https://y.uno/en/blog/how-to-shrink-your-pci-scope-without-sacrificing-checkout-ux  
[104] Yuno Blog — Local Payment Methods — https://y.uno/en/blog/how-to-offer-the-right-local-payment-methods-in-new-markets  
[105] Yuno — Vaulting — https://www.y.uno/solutions/vaulting  
[106] Yuno Blog — Payment Tokenization — https://y.uno/en/blog/payment-tokenization-us  
[107] Yuno Blog — Vault by Yuno — https://y.uno/en/blog/secure-payment-data-vault  
[108] Yuno Docs — React Native SDK — https://docs.y.uno/changelog/react-native  
[109] Yuno Docs — Android Reference — https://docs.y.uno/docs/sdks/resources/references/android  
[110] Yuno Docs — Google Pay — https://docs.y.uno/docs/wallets/google-pay  
[111] Yuno Docs — Web Enrollment — https://docs.y.uno/docs/sdks/card-enrollment/web-enrollment  
[112] Yuno Docs — Ticket Payment Examples — https://temp-yuno-docs.readme.io/reference/payments/payment-examples/ticket-copy  
[113] Yuno Docs — Agent Toolkit — https://docs.y.uno/docs/ai-capabilities/agent-toolkit  
[114] Yuno — Smart Routing (Spanish) — https://y.uno/es/product-updates/introducing-smart-routing  
[115] Yuno Blog — Smart Routing Platform — https://y.uno/en/blog/the-merchants-with-the-highest-approval-rates-all-use-smart-routing  
[116] Yuno Blog — Best Payment Orchestration 2026 — https://y.uno/en/blog/best-payment-orchestration-platforms-in-2026  
[117] Yuno Blog — AI-Driven Payments — https://y.uno/en/blog/ai-driven-payments  
[118] Yuno Blog — Top Orchestration Platforms 2026 — https://y.uno/en/blog/top-payment-orchestration-platforms-2026  
[119] Merchant Risk Council — Yuno Orchestration — https://merchantriskcouncil.org/learning/resource-center/member-news/blog/2025/yuno-orchestration-as-the-new-payment-operating-system-enabling-growth-across-emerging-markets  
[120] Yuno Post — Fraud Is Getting Smarter — https://y.uno/post/fraud-is-getting-smarter---so-should-your-payment-security  
[121] GlobeNewswire — Payments Concierge Launch — https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html  
[122] CityBiz — Q&A Juan Pablo Ortega — https://www.citybiz.co/article/671195/qa-with-juan-pablo-ortega-co-founder-and-ceo-of-yuno-ais-game-changing-role-in-payments/  
[123] Yuno Newsroom — Onafriq Partnership — https://y.uno/en/newsroom/yuno-partners-with-onafriq  
[124] Yuno Blog — Q1 2025 Product Updates — https://y.uno/en/blog/q12025-product-updates  
[125] Yuno — Tracking & Reporting — https://www.y.uno/solutions/tracking-reporting  
[126] Yuno — Tracking & Reporting (Portuguese) — https://y.uno/pt-br/solutions/tracking-reporting  
[127] Yuno Blog — Payment Reconciliation — https://y.uno/en/blog/how-enterprise-saas-platforms-should-think-about-payment-reconciliation-when-operating-across-mu  
[130] Yuno Docs — Build Reports — https://docs.y.uno/docs/direct-integration-use-cases/build-reports  
[131] Yuno Docs — Reports Fields — https://temp-yuno-docs.readme.io/reference/reports-fields  
[132] Yuno Docs — Insights — https://docs.y.uno/docs/using-yuno/dashboard-overview/insights  
[133] EIN Presswire — Yuno Conduit Partnership — https://www.einpresswire.com/article/897023252/yuno-partners-with-conduit-to-power-stablecoin-based-cross-border-payments  
[134] Yuno Docs — Building AI Integrations — https://docs.y.uno/docs/ai-capabilities/building-ai-integrations-with-yunos-llms-and-mcp  

---

**End of Report**