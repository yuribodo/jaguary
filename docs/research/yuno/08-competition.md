# Yuno — Competitive Intelligence Deep Research

**Entity:** Yuno  
**Research date:** 2026-08-29  
**Researcher:** Gabriel Barboza  
**Status:** Draft

---

## Executive Findings

### 1. Yuno occupies a credible, differentiated position at the intersection of global payment orchestration, localized commerce, and AI-led payment operations.

**Classification:** FACT  
**Confidence:** HIGH

Yuno provides a unified payment layer spanning checkout, smart routing, subscriptions, payouts, disputes, reconciliation, fraud-tool connectivity, and payment-method access. Its public materials state that it connects more than 1,000 payment methods across 190–200+ countries through one API, and its SDK suite covers web, iOS, Android, React Native, and Flutter. Its newer AI products add post-failure recovery (NOVA) and operational monitoring/action (Payments Concierge). [Yuno platform guide](https://y.uno/en/blog/best-payment-orchestration-platforms-in-2026), [Yuno API catalog](https://apis.io/providers/yuno/), [Yuno Payments Concierge](https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html)

**Sources:**
- [Yuno: Best Payment Orchestration Platforms in 2026](https://y.uno/en/blog/best-payment-orchestration-platforms-in-2026)
- [Yuno API provider profile](https://apis.io/providers/yuno/)
- [Yuno Payments Concierge announcement](https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html)

---

### 2. The most serious competitive threats differ by layer: Stripe and Adyen at global scale and data, dLocal/EBANX/Rapyd in local and cross-border rails, and Primer/Payrails/Gr4vy/Spreedly in neutral orchestration and merchant control.

**Classification:** INFERENCE  
**Confidence:** HIGH

Stripe and Adyen combine payment acceptance with large-scale proprietary data and AI optimization; Stripe is also developing machine-payment and stablecoin primitives. dLocal and EBANX possess stronger specialized emerging-market and Latin American local-rail positions, while Rapyd combines acceptance, disbursement, acquiring, accounts, and issuing. Pure-play orchestrators compete directly for the multi-PSP control plane: Primer emphasizes no-code workflows and an AI companion, Spreedly emphasizes gateway-neutral token portability, Gr4vy emphasizes single-tenant deployment and agentic commerce, and Payrails is expanding toward a finance operations system. [Stripe Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026), [Adyen global acquiring](https://www.adyen.com/global-acquiring), [dLocal emerging-market guide](https://www.dlocal.com/blog/guides/payment-processing-solutions-emerging-markets/), [Primer AI Companion](https://www.finextra.com/newsarticle/46920/primer-launches-ai-companion-for-payments-teams), [Spreedly orchestration](https://www.spreedly.com/landing/payments-orchestration), [Payrails AI roadmap](https://www.payrails.com/blog/ai-at-payrails-from-clean-data-to-autonomous-agents)

**Sources:**
- [Stripe Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026)
- [Adyen global acquiring](https://www.adyen.com/global-acquiring)
- [dLocal emerging-market guide](https://www.dlocal.com/blog/guides/payment-processing-solutions-emerging-markets/)
- [Primer launches AI Companion](https://www.finextra.com/newsarticle/46920/primer-launches-ai-companion-for-payments-teams)
- [Spreedly payment orchestration](https://www.spreedly.com/landing/payments-orchestration)
- [Payrails: AI from data to autonomous agents](https://www.payrails.com/blog/ai-at-payrails-from-clean-data-to-autonomous-agents)

---

### 3. Yuno’s strongest immediate moat is not routing alone; it is the combination of payment-data access, localized recovery conversations, and controlled operational action across a multi-provider stack.

**Classification:** INFERENCE  
**Confidence:** MEDIUM

Routing, retries, tokenization, dashboards, and provider abstractions are widely offered by orchestration vendors and are therefore becoming table stakes. Yuno’s NOVA reportedly reaches customers via phone and WhatsApp in more than 70 languages after failed payments, while Payments Concierge can detect anomalies and execute bounded actions such as routing changes and checkout-method ordering. A competitor could build pieces of this, but replicating it requires merchant authorization, real-time payment context, localized conversation operations, consent controls, and outcome feedback loops. [Yuno NOVA announcement](https://y.uno/newsroom/yuno-launches-nova-ai-agents-to-turn-payment-friction-into-growth-merchants-recover-up-to-75-percent-of-failed-transactions), [Yuno Payments Concierge](https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html), [Primer Workflows](https://primer.io/blog/which-tool-lets-merchants-route-payments-without-writing-code), [Hyperswitch payment suite](https://docs.hyperswitch.io/about-hyperswitch/payment-suite)

**Sources:**
- [Yuno launches NOVA](https://y.uno/newsroom/yuno-launches-nova-ai-agents-to-turn-payment-friction-into-growth-merchants-recover-up-to-75-percent-of-failed-transactions)
- [Yuno Payments Concierge announcement](https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html)
- [Primer no-code routing](https://primer.io/blog/which-tool-lets-merchants-route-payments-without-writing-code)
- [Hyperswitch payment orchestration](https://docs.hyperswitch.io/about-hyperswitch/payment-suite)

---

### 4. The biggest strategic gap is a verifiable, open agentic-payment and multi-chain stablecoin control plane—especially one adapted to Latin America and emerging-market payment rails.

**Classification:** INFERENCE  
**Confidence:** MEDIUM

Stripe has announced Machine Payments Protocol capabilities for microtransactions, recurring payments, stablecoin acceptance, and global stablecoin payouts. Gr4vy has announced an Agentic Development Kit and MCP capability, and Nuvei has announced a live in-agent payment proof of concept plus agent risk and developer-sandbox plans. Yuno has public evidence of stablecoin rails and payouts, but the reviewed materials do not establish an equally public, developer-oriented protocol for programmable agent mandates, wallet policy, multi-chain settlement, agent identity, and cross-border local-currency payout orchestration. [Stripe Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026), [Gr4vy agentic payments](https://www.crowdfundinsider.com/2026/04/273770-gr4vy-now-supports-agentic-payments-unveils-agentic-development-kit/), [Nuvei agentic strategy](https://www.nuvei.com/posts/nuvei-completes-first-party-in-agent-payment-with-visa-unveils-merchant-led-agentic-payments-strategy), [Yuno Series B coverage](https://theindustryspread.com/yuno-45m-series-b-payment-orchestration-stablecoin-rails/)

**Sources:**
- [Stripe Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026)
- [Gr4vy agentic payments and ADK](https://www.crowdfundinsider.com/2026/04/273770-gr4vy-now-supports-agentic-payments-unveils-agentic-development-kit/)
- [Nuvei in-agent payment strategy](https://www.nuvei.com/posts/nuvei-completes-first-party-in-agent-payment-with-visa-unveils-merchant-led-agentic-payments-strategy)
- [Yuno stablecoin rails coverage](https://theindustryspread.com/yuno-45m-series-b-payment-orchestration-stablecoin-rails/)

---

## Detailed Research

### Competitive landscape

Yuno competes in several overlapping categories rather than one clean market. The competitive set includes full-stack payment platforms, global acquirers, cross-border/local-method specialists, neutral payment orchestrators, finance-operations platforms, fraud and optimization vendors, and developer-first/open-source infrastructure.

| Segment | Representative competitors | Why they matter to Yuno |
|---|---|---|
| Full-stack payment infrastructure | Stripe, Adyen, Checkout.com, Nuvei, PayU, Solidgate | They bundle acceptance, acquiring, fraud, checkout, payouts, and optimization; customers may prefer fewer vendors |
| Neutral payment orchestration | Primer, Spreedly, Gr4vy, Payrails, BR-DGE, APEXX, Paydock, ProcessOut | They compete directly for the multi-PSP decision layer, token portability, routing, and merchant control |
| Cross-border and local rails | dLocal, EBANX, Rapyd, Airwallex | They own or aggregate local payment methods, FX, settlement, licensing, and payout infrastructure |
| Developer/open infrastructure | Hyperswitch/Juspay | Open source and self-hosting appeal to enterprises seeking data sovereignty and lower lock-in |
| Fraud and payment optimization | Stripe Radar, Adyen Uplift, Nuvei Shields Up, Solidgate fraud stack | Optimization and fraud increasingly influence authorization rate, cost, and conversion at transaction level |

This segmentation is supported by the products vendors publicly describe: dLocal provides payins, payouts, routing, fraud, and local acquiring; Rapyd offers collect, disburse, accounts, and issuing; Spreedly normalizes access to gateways and fraud providers; and Hyperswitch provides an open-source, self-hostable multi-processor layer. [dLocal marketplace solution](https://www.dlocal.com/our-industries-v2/marketplace-industry/), [Rapyd products](https://www.rapyd.net/products-2/), [Spreedly orchestration](https://www.spreedly.com/landing/payments-orchestration), [Hyperswitch repository](https://github.com/juspay/hyperswitch?ref=ossgallery)

---

### Competitor comparison

| Company | Core product | Target customer | Geography | Differentiator | AI | Developer experience | Yuno advantage | Yuno weakness |
|---|---|---|---|---|---|---|---|---|
| **Yuno** | Orchestration, checkout, routing, payouts, subscriptions, disputes, reconciliation | Global enterprises, merchants, banks, wallets | Global; strong emerging-market relevance | Unified stack plus AI recovery and payment operations | NOVA recovery; Payments Concierge actioning | One API; web/mobile SDKs; MCP and agent toolkit listed publicly | Broader orchestration-to-operations AI story, localized recovery | Less demonstrated scale/data moat than Stripe/Adyen; fewer publicly verified agent-payment primitives |
| **Stripe** | Full-stack payments, billing, treasury, fraud, stablecoin and agent payments | Developers, startups through global enterprise | Global, especially developed-market software ecosystems | Developer ecosystem, platform breadth, proprietary transaction data | Payments Foundation Model; agentic commerce; MPP | Best-in-class API ecosystem and extensive tooling | Yuno can be more PSP-neutral and more localized across fragmented markets | Stripe’s scale, ecosystem, data, and agentic/stablecoin momentum |
| **Adyen** | Unified acquiring, processing, payouts, risk, issuing | Large global enterprises | 130+ countries | Single global acquiring platform and enterprise data | Uplift optimization across funnel | Enterprise APIs; less open/neutral than orchestration vendors | Yuno can aggregate multiple PSPs and local providers rather than requiring one rail | Adyen’s direct acquiring, local processing, and data advantage |
| **Primer** | Multi-PSP orchestration and no-code workflows | Payment teams and global merchants | Global; strong Europe positioning | Visual no-code Workflows | Companion analyzes context and can act after approval | Low-code API + drag-and-drop operating model | Yuno’s customer-recovery AI and broader payout/localization narrative | Primer’s workflow UX and AI operations positioning are highly direct competition |
| **Spreedly** | Gateway-neutral orchestration and token vault | Platforms, SaaS, marketplaces, enterprises | Global | Processor portability and broad connectivity | No comparable native AI agent evidenced in reviewed sources | Strong API-first, OpenAPI, many APIs | Yuno can offer more end-to-end checkout, optimization, and agentic ops | Spreedly’s long-established neutral vault/connectivity position |
| **Gr4vy** | Single-tenant orchestration, vault, routing, agentic toolkit | Enterprises, platforms, PayFacs | Global | Dedicated merchant instance/data isolation | MCP per tenant; ADK for agentic storefronts | APIs, SDKs, no-code flows | Yuno has broader public localization and recovery operations | Gr4vy has a clearer single-tenant/data sovereignty and agentic developer narrative |
| **Payrails** | Payment orchestration plus Finance OS/reconciliation | Enterprise merchants with complex finance ops | Europe-led, global ambition | Unified finance data model and reconciliation | ML routing, analytics copilot, autonomous-agent roadmap | Modular API and normalized provider layer | Yuno’s customer-facing recovery and checkout capabilities | Payrails may outpace Yuno in back-office finance operations and reconciliation intelligence |
| **dLocal** | Emerging-market payins, payouts, local acquiring, settlement | Global enterprises expanding into emerging markets | LatAm, Africa, Middle East, Asia | Deep local rails and compliance/settlement | Smart routing and fraud prevention | Single API for 1,000+ methods | Yuno can orchestrate dLocal alongside other providers and optimize provider selection | dLocal has stronger direct local-acquiring and market-entry depth in emerging markets |
| **EBANX** | Cross-border Latin America payment acceptance | International merchants selling to LatAm | LatAm-focused, selective Africa/Asia | Deep LATAM localization: PIX, boleto, installments, OXXO | Risk/3DS tools; no major agentic AI evidence in reviewed sources | API, SDK, hosted checkout | Yuno can combine EBANX with other local providers under one experience | EBANX’s specialist local knowledge and method depth in Brazil/LatAm |
| **Rapyd** | Fintech-as-a-Service: collect, payouts, accounts, cards, issuing | Platforms, fintechs, global merchants | 100+ countries / 190+ market claims | Broad embedded-finance breadth | No major native agentic AI evidence in reviewed sources | API, hosted checkout, links, no-code options | Yuno offers vendor-neutral orchestration above varied PSPs | Rapyd offers more native account, card, issuing, and fund-holding primitives |
| **Airwallex** | Global accounts, FX, cards, payouts, acceptance, treasury | International businesses and platforms | Global, APAC-led | FX/treasury and global business accounts | AI/agent relevance emerging; stablecoin exploration publicly discussed | Broad APIs for financial primitives | Yuno’s multi-PSP payment performance layer | Airwallex is stronger in treasury, FX, accounts, and business spend |
| **Checkout.com** | Enterprise payment processing, acquiring, risk, payouts | Digital enterprises | Global | Direct processor/acquirer and enterprise performance | Fraud/optimization capabilities; agentic details not established here | Strong enterprise APIs | Yuno can orchestrate Checkout.com alongside alternatives | Direct processing economics and acquiring control |
| **Nuvei** | Payment acceptance, payouts, banking, risk, issuing | Global and regulated enterprises | Global | Broad alternative methods, risk stack, modular infrastructure | Optimization engine; AI integration agent; in-agent payment work | API, SDKs, sandbox | Yuno’s multi-PSP neutrality and recovery-oriented AI | Nuvei’s processor depth, KYC/risk, and visible agentic-commerce program |
| **PayU** | Payment gateway/acquiring and local market payments | Merchants in growth markets | Strong India, LatAm, CEE, Africa footprint | Local-market presence through regional operations | Not enough evidence reviewed for current AI posture | APIs and checkout tools | Yuno can abstract PayU plus alternatives across markets | PayU’s local licenses, distribution, and legacy scale in core markets |
| **Solidgate** | Hybrid orchestration, acquiring, billing, fraud, tax | SaaS, digital goods, subscriptions, ecommerce | Global | Bundled billing, tax, fraud, and acquiring | ML fraud screening | Unified API and connectors | Yuno appears broader in multi-provider operations and recovery AI | Solidgate’s vertically integrated subscription, tax, and risk bundle |
| **Hyperswitch (Juspay)** | Open-source payment orchestration, vault, routing, reconciliation | Engineering-led merchants needing control | Global | Apache-2.0/self-hosted control and composable architecture | Intelligent routing; no native conversational agent evidenced | Unified REST API; self-host or SaaS | Yuno is managed, productized, and can reduce implementation burden | Open source, self-hosting, and data sovereignty can be decisive for some buyers |

**Evidence notes:** Yuno’s platform/SDK coverage is described in its API profile and documentation; Stripe’s agentic payments are announced in its Sessions release; Adyen describes 130+ country processing and AI-driven optimization; Primer’s Workflows and Companion are public; Spreedly reports 120+ integrations; Gr4vy reports 400+ connections and agentic tools; dLocal reports 1,000+ local methods; and Hyperswitch documents self-hosting, routing, vault, and reconciliation. [Yuno API catalog](https://apis.io/providers/yuno/), [Stripe Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026), [Adyen global acquiring](https://www.adyen.com/global-acquiring), [Primer Companion](https://www.finextra.com/newsarticle/46920/primer-launches-ai-companion-for-payments-teams), [Spreedly Spring 2026](https://www.spreedly.com/blog/spreedly-spring-release-2026), [Gr4vy orchestration](https://gr4vy.com/lp/payment-orchestration/), [dLocal gateway guide](https://www.dlocal.com/blog/guides/payment-gateway-for-emerging-markets-a-complete-guide/), [Hyperswitch payment suite](https://docs.hyperswitch.io/about-hyperswitch/payment-suite)

---

### Product comparison

| Capability | Yuno | Stripe / Adyen | Primer / Spreedly / Gr4vy / Payrails | dLocal / EBANX / Rapyd / Airwallex | Strategic reading |
|---|---|---|---|---|---|
| APIs and SDKs | One payments API; checkout SDKs for web, iOS, Android, React Native, Flutter | Very mature APIs; Stripe especially broad developer tooling | API-first; each stresses normalized integrations; Gr4vy/Spreedly strong connectivity | APIs typically expose local methods plus payins/payouts; Airwallex extends into accounts/FX | Yuno is competitive, but DX leadership needs measurable onboarding and ecosystem depth |
| Payment methods | 1,000+ stated methods | Broad global coverage, often strongest in cards/wallets and direct acquiring | Access depends on connectors; Gr4vy says 400+ connections | dLocal and Rapyd state 1,000+/900+ methods; EBANX deep in LatAm | Coverage counts matter less than country-method-quality, uptime, conversion, and activation speed |
| Routing | Smart routing, fallback, A/B testing | Stripe ML optimization; Adyen uses internal acquiring data | Core strength: visual rules, failover, ML/flow routing | dLocal and Nuvei offer routing, but generally inside their own stack | Baseline capability; defensibility moves to data quality and autonomous, governed action |
| Checkout | Full, Lite, Seamless, and Headless styles | Mature checkout products | Varies; some are orchestration-first rather than checkout-first | Hosted checkout/payment links common | Yuno’s four integration modes are a good fit for enterprises with different control needs |
| Fraud | Integrates fraud tooling and public materials reference fraud capabilities | Stripe Radar and Adyen risk/optimization are deeply integrated | Third-party fraud connectivity is a major pattern | Nuvei and Solidgate bundle strong risk; dLocal includes fraud prevention | Native/connected fraud alone is not unique; cross-provider learning and explainability are opportunity areas |
| Recurring payments | Subscriptions, card vaulting, retries, account updater listed | Stripe Billing is broad; Adyen and Solidgate strong enterprise/subscription offerings | Supported through orchestration/connectors; Payrails supports payment lifecycle workflows | Varies; regional recurring bank rails may be uneven | Recurring recovery, churn prevention, and local mandate support are more valuable than basic retries |
| Cross-border | Global orchestration and payouts; stablecoin rails publicly reported | Stripe and Adyen global scale; Stripe adds stablecoin payouts | Usually route to specialist providers rather than own rails | Core strength of dLocal, EBANX, Rapyd, Airwallex | Yuno should be the optimizer and policy layer across specialist rails, not try to replace all rails |
| Local payment methods | Broad global catalog, localized SDK/checkout language support | Extensive but coverage varies by market | Connector-dependent | dLocal/EBANX/Rapyd have strongest local-rail value proposition | A Brazil/LatAm-first local-method intelligence layer could materially differentiate Yuno |
| Stablecoins | Public reporting says stablecoin rails/payouts added | Stripe is visibly ahead in stablecoin/agent payment protocols | Gr4vy is agentic-ready; public stablecoin detail less visible | Airwallex is exploring/building; Rapyd has fintech primitives | Yuno needs programmable policy, compliance, liquidity routing, and local off-ramp differentiation |
| AI | NOVA failure recovery; Payments Concierge monitoring and bounded autonomous actions | Stripe foundation-model optimization; Adyen AI trained on large volume | Primer Companion; Payrails autonomous-agent roadmap; Gr4vy MCP/ADK | Nuvei AI agent and optimization; local players less visible in agents | Yuno is a front-runner in recovery/ops AI, but cannot assume durable AI leadership |
| Enterprise integrations | PSPs, fraud, payment methods, payouts, banking, PCI proxy | Strong native platform integrations and partner ecosystems | Strong multi-provider connectivity and enterprise controls | Strong local partners, licenses, and settlement | Yuno should deepen enterprise-grade governance, observability, data residency, and connector quality |

Yuno’s SDK options include Full, Lite, Seamless, and Headless flows; its documentation also describes a workflow that hides payment-method-specific data inside an SDK-generated one-time token. These are meaningful DX strengths, though Stripe’s broader developer ecosystem and open-source alternatives’ deployment flexibility remain material benchmarks. [Yuno Web SDK](https://docs.y.uno/changelog/web-sdk-v1.0-changelog), [Yuno payment examples](https://temp-yuno-docs.readme.io/reference/payment-examples), [Stripe routing guide](https://stripe.com/resources/more/intelligent-payment-routing), [Hyperswitch integration patterns](https://deepwiki.com/juspay/hyperswitch-docs/10.8-api-reference-and-integration-patterns)

---

### Competitive position

#### What Yuno does better

1. **Payment recovery as a customer conversation rather than only a transaction retry.** NOVA is designed to engage users after payment failure through phone and WhatsApp, select channels/scripts dynamically, support more than 70 languages, and work alongside routing and retry logic. This is materially broader than traditional passive dunning or PSP fallback. **Classification: FACT. Confidence: HIGH.** [Yuno NOVA announcement](https://y.uno/newsroom/yuno-launches-nova-ai-agents-to-turn-payment-friction-into-growth-merchants-recover-up-to-75-percent-of-failed-transactions)
2. **A multi-provider operational agent with bounded execution.** Payments Concierge publicly describes anomaly detection, fee transparency, analysis, and actions such as altering routing rules, changing enabled providers, or reordering checkout options under merchant controls. **Classification: FACT. Confidence: HIGH.** [Yuno Payments Concierge](https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html)
3. **Potentially strong fit for multi-market enterprises that need one layer across fragmented local methods, fraud providers, and payouts.** This is an inference from Yuno’s stated global connectivity and orchestration model, especially compared with single-provider acquiring platforms. **Classification: INFERENCE. Confidence: MEDIUM.** [Yuno API catalog](https://apis.io/providers/yuno/), [dLocal marketplace platform](https://www.dlocal.com/our-industries-v2/marketplace-industry/)

#### What Yuno does worse

1. **Direct acquiring and proprietary network-scale data.** Adyen controls a unified acquiring platform across 130+ countries and states that its AI is trained on trillions of transactions; Stripe also promotes foundation-model-based optimization. Yuno’s multi-provider model can be advantageous, but it does not by itself establish comparable direct processor data or economics. **Classification: INFERENCE. Confidence: HIGH.** [Adyen global acquiring](https://www.adyen.com/global-acquiring), [Stripe intelligent routing](https://stripe.com/resources/more/intelligent-payment-routing)
2. **Specialist ownership of local rails and compliance.** dLocal, EBANX, and Rapyd explicitly position local acquiring, local methods, settlement, licensing, and embedded-finance capabilities as core products. Yuno can orchestrate these rails but may depend on partner coverage and commercial terms. **Classification: INFERENCE. Confidence: HIGH.** [dLocal emerging-market guide](https://www.dlocal.com/blog/guides/payment-processing-solutions-emerging-markets/), [EBANX profile](https://www.16idc.com/en-us/provider-detail/ebanx), [Rapyd products](https://www.rapyd.net/products-2/)
3. **Open-source/self-hosted sovereignty.** Hyperswitch offers a self-hosted, open-source alternative with a PCI vault and multi-processor routing. This is a structural procurement advantage for buyers with strict data-residency or vendor-control requirements. **Classification: FACT. Confidence: HIGH.** [Hyperswitch repository](https://github.com/juspay/hyperswitch?ref=ossgallery)

#### Unique versus commodity

| Area | Assessment | Classification | Confidence |
|---|---|---|---|
| Multi-PSP routing, retries, dashboards, provider connectors | Rapidly commoditizing: nearly every orchestrator offers them | INFERENCE | HIGH |
| No-code workflow configuration | Increasingly standard among orchestration leaders | INFERENCE | HIGH |
| Token portability and vault abstraction | Competitive differentiator, but not unique; Spreedly, Gr4vy, Payrails, Hyperswitch emphasize it | FACT / INFERENCE | HIGH |
| Conversational, multilingual, post-failure payment recovery | Differentiated in the reviewed public set | INFERENCE | MEDIUM |
| Governed autonomous payment-operations action across PSPs | Differentiated but contested: Yuno, Primer, Payrails, and others are converging | INFERENCE | MEDIUM |
| Open agentic payment protocol and stablecoin machine-payment rails | Stripe currently appears ahead publicly | INFERENCE | MEDIUM |

#### Moats

**Strongest current moat:** a closed-loop outcome engine linking payment telemetry, routing/retry context, localized customer recovery, and controlled operational actions. Its value compounds if Yuno captures consented outcomes by issuer, method, channel, market, merchant vertical, and recovery intervention. **Classification: INFERENCE. Confidence: MEDIUM.** [Yuno NOVA](https://y.uno/newsroom/yuno-launches-nova-ai-agents-to-turn-payment-friction-into-growth-merchants-recover-up-to-75-percent-of-failed-transactions), [Yuno Payments Concierge](https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html)

**Missing moat:** developer and ecosystem gravity comparable to Stripe; direct acquiring/local-rail control comparable to Adyen/dLocal/EBANX; or self-hosted/open-platform credibility comparable to Hyperswitch. A further missing moat is a publicly documented agent-payment standard and policy layer that is interoperable across fiat, stablecoins, chains, and local payout rails. **Classification: INFERENCE. Confidence: HIGH.** [Stripe Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026), [Adyen global acquiring](https://www.adyen.com/global-acquiring), [Hyperswitch payment suite](https://docs.hyperswitch.io/about-hyperswitch/payment-suite)

---

### Competitor strategy

| Strategic frontier | What competitors are building | Yuno position | Assessment |
|---|---|---|---|
| AI optimization | Stripe promotes ML/foundation-model payment optimization; Adyen Uplift combines routing, tokens, and false-decline reduction; Payrails is moving from normalized data to ML and agents | Yuno has routing, NOVA, and Concierge | **Roughly aligned to ahead** in payment-ops and customer recovery; **behind** in publicly evidenced data scale |
| AI agents | Primer Companion can recommend and act on approved changes; Gr4vy offers an ADK; Nuvei has an integration agent and agentic-commerce roadmap | Concierge autonomously monitors and executes controlled actions; Yuno lists an MCP/agent toolkit | **Roughly aligned**, but protocol and ecosystem race remains open |
| Stablecoins | Stripe has MPP, stablecoin acceptance, and global stablecoin payouts; Airwallex is building for stablecoin use cases | Yuno reportedly has stablecoin rails/payouts | **Behind Stripe publicly**; opportunity to specialize in emerging-market settlement and payout policy |
| Cross-border/local rails | dLocal/EBANX/Rapyd/Airwallex deepen local payment, settlement, FX, and financial-account products | Yuno orchestrates across providers | **Potentially advantaged as an aggregator**, but **behind** where direct rail ownership determines economics/compliance |
| Fraud | Nuvei, Solidgate, Stripe, and Adyen integrate fraud into their core stacks | Yuno connects fraud tools and promotes security | **Roughly aligned in integration**, but direct proprietary risk data is an unresolved gap |
| Finance operations | Payrails is positioning as a Finance OS and emphasizes AI-assisted reconciliation | Yuno includes reconciliation and analytics | **At risk of falling behind** in reconciliation and CFO/ERP workflows unless it expands the operating model |
| Open developer infrastructure | Hyperswitch offers open source, self-hosting, and composable modules | Yuno is managed/API-first | **Behind** for sovereignty-first buyers; not necessarily a target segment |

**Current-build evidence:** Stripe announced MPP, agent payments, stablecoin features, and Global Payouts; Nuvei announced a July 2026 in-agent purchase and future developer sandbox; Primer launched Companion; Gr4vy launched its ADK; and Payrails describes a staged path from data standardization to optimization and autonomy. [Stripe Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026), [Nuvei agentic strategy](https://www.nuvei.com/posts/nuvei-completes-first-party-in-agent-payment-with-visa-unveils-merchant-led-agentic-payments-strategy), [Primer Companion](https://www.finextra.com/newsarticle/46920/primer-launches-ai-companion-for-payments-teams), [Gr4vy agentic payments](https://www.crowdfundinsider.com/2026/04/273770-gr4vy-now-supports-agentic-payments-unveils-agentic-development-kit/), [Payrails AI roadmap](https://www.payrails.com/blog/ai-at-payrails-from-clean-data-to-autonomous-agents)

---

## Strategic Implications

1. **Compete above the rails, not against every rail.** Yuno should position itself as the decision, policy, experimentation, recovery, and observability layer over regional specialists such as dLocal, EBANX, Rapyd, and direct acquirers. This turns provider fragmentation into the reason to buy Yuno instead of a reason to bypass it. **Classification: INFERENCE. Confidence: HIGH.**
2. **Turn AI into an auditable product, not a feature list.** Routing recommendations, recovery interventions, and autonomous actions need explicit objectives, merchant-defined guardrails, explanations, approval trails, rollback, and measured incrementality. This is especially important because competitors are already shipping AI agents and ML routing. **Classification: INFERENCE. Confidence: HIGH.**
3. **Own the “failed intent” lifecycle.** A payment decline is not merely a routing event: it can be an issuer problem, customer-authentication issue, insufficient-funds moment, local-method mismatch, fraud false positive, or checkout UX failure. Yuno’s recovery agent provides a starting point for a unique end-to-end recovery graph. **Classification: INFERENCE. Confidence: MEDIUM.**
4. **Build an agentic payments control plane for emerging markets.** The market is moving toward AI agents that spend, subscribe, and settle through stablecoins and fiat. A defensible Yuno role is policy-aware orchestration across agent identity, customer consent, stablecoin liquidity, local currency, tax/compliance signals, and local payout rails. **Classification: INFERENCE. Confidence: MEDIUM.**
5. **Defend DX with composability.** Strong SDKs should be complemented by sandbox quality, reusable templates, event replay, connector contracts, observability, test fixtures, and agent-safe tools. This counters Stripe’s developer ecosystem and Hyperswitch’s openness. **Classification: INFERENCE. Confidence: HIGH.**

---

## Opportunities

Potential opportunities discovered:

1. **AI Decline Root-Cause Graph** — **INFERENCE, HIGH.** Build a cross-provider causal model that explains each lost payment intent: issuer behavior, PSP degradation, 3DS friction, fraud block, insufficient funds, currency mismatch, local-method availability, or checkout abandonment. It should recommend and, within policy, execute the next best action across route, retry timing, authentication, payment-method presentation, and NOVA outreach.
2. **Brazil/LatAm Local-Rail Intelligence Layer** — **INFERENCE, HIGH.** Create a real-time method-ranking and reliability service for PIX, Pix Automático, boleto, card installments, wallet, bank-transfer, and voucher flows by merchant vertical, state/city, issuer/bank, time, and transaction context. dLocal and EBANX supply rails; Yuno can optimize across them and expose the decisioning to merchants.
3. **Stablecoin-to-Local Payout Optimizer** — **INFERENCE, MEDIUM.** Allow businesses or agents to fund payouts in permitted stablecoins while Yuno chooses compliant routes to recipient-local fiat or eligible stablecoin wallets, optimizing for FX, fees, settlement speed, liquidity, and payout success. Stripe’s MPP and stablecoin payouts validate demand, while local off-ramp and policy complexity remain open.
4. **Agent Payment Mandate Vault** — **INFERENCE, MEDIUM.** Create reusable, revocable spending mandates for AI agents: per-agent budgets, merchant/category allowlists, currency and stablecoin constraints, time windows, escalation rules, approval thresholds, and full auditability. It can map a user/enterprise mandate into card, bank, local, and stablecoin payment execution.
5. **Merchant Recovery Studio** — **INFERENCE, HIGH.** Expand NOVA from a recovery channel into a merchant-configurable experimentation product: customer segments, language/tone, timing, channel, incentive, alternative methods, compliance consent, and causal incrementality measurement. This makes the recovery loop measurable rather than a black-box claim.
6. **Autonomous Checkout Experimentation** — **INFERENCE, MEDIUM.** Let an AI agent safely run small, reversible experiments on checkout ordering, local-method promotions, 3DS strategy, and fallback flows, with causal controls and automatic rollback when conversion, fraud, or cost guardrails degrade.
7. **Payment Reliability Digital Twin** — **INFERENCE, MEDIUM.** Simulate outages, issuer changes, FX shifts, fraud-rule changes, and routing strategies using historic events before deploying them. This reduces risk from autonomous or manually configured routing changes.
8. **Cross-PSP Reconciliation and Dispute Copilot** — **INFERENCE, HIGH.** Normalize settlements, fees, reserves, chargebacks, and payout statuses across providers; identify mismatches; draft dispute evidence; and surface working-capital exposure. Payrails signals strong demand here, so Yuno needs a differentiated workflow tied directly to routing and recovery outcomes.
9. **Agentic Commerce Fraud and Trust Graph** — **INFERENCE, MEDIUM.** Detect whether a payment is human-initiated, agent-assisted, or autonomous; assess agent identity, mandate validity, merchant reputation, tool-call chain, and unusual spending patterns; then apply dynamic safeguards rather than blocking agentic payments outright.
10. **Local-Method Migration Engine** — **INFERENCE, HIGH.** When a preferred payment method fails or is unavailable, guide the customer into the best viable local alternative without losing context—e.g., card to PIX, boleto to wallet, or failed recurring card to Pix Automático where appropriate. Measure conversion uplift by segment and provider.
11. **Payment-Provider Procurement Copilot** — **INFERENCE, MEDIUM.** Turn Yuno’s cross-provider telemetry into an evidence-driven tool that identifies underserved corridors, predicts the value of a new PSP/local-method connector, and quantifies negotiating leverage with existing providers.
12. **Compliance-Aware Cross-Border Policy Engine** — **INFERENCE, MEDIUM.** Encode country, currency, KYB/KYC, sanctions, consent, data residency, tax, payout, and stablecoin restrictions into versioned policies that are evaluated before autonomous payment actions.

---

## Risks / Weaknesses

1. **AI convergence risk.** Yuno’s AI differentiation is real but not isolated: Stripe, Adyen, Primer, Payrails, Gr4vy, and Nuvei all publicly describe AI optimization or agent programs. Differentiation requires outcome proof, control quality, and localized execution—not generic copilots. **Classification: INFERENCE. Confidence: HIGH.**
2. **Rail-ownership risk.** Direct acquirers and local specialists can offer economics, underwriting, settlement, and compliance integration that a neutral layer cannot fully control. **Classification: INFERENCE. Confidence: HIGH.**
3. **Data-access risk.** Prediction quality depends on receiving granular, timely, normalized authorization, fraud, cost, and settlement feedback from each provider; providers may restrict data or compete with the orchestrator. **Classification: INFERENCE. Confidence: HIGH.**
4. **Autonomy and compliance risk.** Changing routes, payment-method ordering, customer outreach, and agent spending behavior requires robust consent, explainability, audit logs, role controls, rollback, and jurisdiction-specific compliance. **Classification: INFERENCE. Confidence: HIGH.**
5. **Vendor-neutrality tension.** Adding more proprietary services—fraud, stablecoin rails, recovery, and payout products—can improve value but risks making Yuno look like another full-stack provider rather than a neutral orchestrator. **Classification: INFERENCE. Confidence: MEDIUM.**
6. **Open-source price pressure.** Self-hosted systems such as Hyperswitch may lower willingness to pay for basic routing and connector abstraction, particularly among engineering-heavy businesses. **Classification: INFERENCE. Confidence: MEDIUM.**

---

## Unknowns

Important things we still don't know:

- Yuno’s actual connector-level coverage, uptime, activation times, and authorization-rate uplift by country, method, and PSP; vendor-wide coverage claims do not answer merchant-specific quality.
- The commercial model, margin structure, and degree of Yuno’s direct versus partner-provided acquiring, fraud, local-method, stablecoin, and payout services.
- Whether Yuno offers a provider-agnostic portable token vault, regional data residency, or deployment options comparable to Spreedly, Gr4vy, Payrails, or Hyperswitch.
- The technical architecture and availability of Yuno’s public MCP server and agent toolkit, including scopes, approval design, audit trails, policy controls, SDKs, and production customer adoption.
- NOVA’s independent, cohort-controlled incremental recovery rate; “up to 75%” applies to answered calls and should not be interpreted as the recovery rate across all failed payment attempts.
- The exact current scope of Yuno stablecoin support: assets, chains, countries, custody model, conversion, compliance workflow, liquidity partners, payout corridors, and settlement SLAs.
- Nauta’s product assets, APIs, data access, team skill distribution, and hackathon constraints. Recommendations below treat Nauta as a potential AI/data/product contributor rather than an established product capability.

---

## Contradictions

### Yuno’s global coverage count

One Yuno publication says it connects 1,000+ payment methods across 200+ countries, while other sources describe 190+ countries. The difference may reflect timing, a distinction between countries and territories, or marketing-methodology variation; it should not be treated as a precise comparable metric without a dated country/method matrix. [Yuno platform guide](https://y.uno/en/blog/best-payment-orchestration-platforms-in-2026), [Yuno API catalog](https://apis.io/providers/yuno/), [Yuno funding coverage](https://disrupts.disruptsmedia.com/fintech/yuno-raises-45m-series-b-power-global-payments-infrastructure)

### Assessment

Our conclusion:

Use “1,000+ methods with global coverage” in strategy documents and request a dated, connector-level coverage export before making exact country claims. **Classification: INFERENCE. Confidence: HIGH.**

### NOVA recovery performance

Yuno reports recovery of up to 75% of failed payments on calls that were answered. This is not directly comparable to a portfolio-wide recovery rate because it excludes unanswered calls and depends on merchant, decline reason, market, consent, and outreach conditions. [Yuno NOVA announcement](https://y.uno/newsroom/yuno-launches-nova-ai-agents-to-turn-payment-friction-into-growth-merchants-recover-up-to-75-percent-of-failed-transactions)

### Assessment

Our conclusion:

Treat NOVA’s metric as promising directional evidence, not a universally achievable benchmark. A hackathon prototype should measure incremental recovered GMV against randomized holdout groups. **Classification: INFERENCE. Confidence: HIGH.**

### Competitor feature claims

Competitor marketing uses inconsistent terms—“payment methods,” “connectors,” “providers,” “countries,” “markets,” and “local rails”—and often bundles direct capabilities with partner-enabled capabilities. For example, dLocal states 1,000+ methods across 60+ emerging markets, while Rapyd describes 900+ local methods across 190+ countries; those measures do not necessarily reflect equal integration depth or merchant availability. [dLocal gateway guide](https://www.dlocal.com/blog/guides/payment-gateway-for-emerging-markets-a-complete-guide/), [Rapyd merchant account guide](https://www.rapyd.net/blog/what-is-a-merchant-account/)

### Assessment

Our conclusion:

Score vendors through corridor-specific tests: activation time, local entity requirements, success rate, fees, settlement time, dispute operations, payout success, and data quality—not headline coverage counts. **Classification: INFERENCE. Confidence: HIGH.**

---

## Important Quotes

> “NOVA turns card declines, abandoned checkouts, and missed payments into AI-powered customer conversations via phone and WhatsApp.”

**Speaker:** Yuno  
**Date:** 2025-09-16  
**Source:** [Yuno NOVA announcement](https://y.uno/newsroom/yuno-launches-nova-ai-agents-to-turn-payment-friction-into-growth-merchants-recover-up-to-75-percent-of-failed-transactions)

> “Autonomous Optimization: Goes beyond alerts to take action: adjusting routing rules, enabling or disabling payment providers, and reordering checkout payment methods.”

**Speaker:** Yuno  
**Date:** 2026-04-06  
**Source:** [Yuno Payments Concierge announcement](https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html)

> “Agents can now programmatically transact with your business via microtransactions, recurring payments, and more with the Machine Payments Protocol.”

**Speaker:** Stripe  
**Date:** 2026-04-29  
**Source:** [Stripe Sessions 2026](https://stripe.com/blog/everything-we-announced-at-sessions-2026)

> “Our job is to refine all of that into a single, coherent data layer.”

**Speaker:** Payrails  
**Date:** 2026-03-12  
**Source:** [Payrails: AI from clean data to autonomous agents](https://www.payrails.com/blog/ai-at-payrails-from-clean-data-to-autonomous-agents)

---

## Hackathon Implications

### What a team could build that is difficult to replicate

Build a **Consent-Aware Local Payment Recovery and Agentic Settlement Control Plane**: a policy-controlled AI system that consumes Yuno payment events, explains why a payment intent failed, chooses the next best recovery action across routing, local payment-method migration, customer outreach, and stablecoin/local-fiat payout, and proves incremental impact through experimentation.

This would be difficult for competitors to replicate quickly because it combines four layers that usually sit in separate products: multi-PSP data normalization, local payment behavior, customer communication/recovery, and auditable AI execution. It amplifies Yuno’s existing orchestration and NOVA/Concierge direction rather than trying to rebuild a gateway or an LLM chatbot. **Classification: INFERENCE. Confidence: MEDIUM.** [Yuno NOVA](https://y.uno/newsroom/yuno-launches-nova-ai-agents-to-turn-payment-friction-into-growth-merchants-recover-up-to-75-percent-of-failed-transactions), [Yuno Payments Concierge](https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html)

### Five highest-priority opportunities

| Rank | Opportunity | Why it scores highly | MVP scope | Classification / confidence |
|---|---|---|---|---|
| 1 | **AI Decline Root-Cause Graph + Next Best Action** | Directly reinforces Yuno routing, Concierge, and NOVA; AI has clear decision support value; works without building new rails | Ingest synthetic/Yuno-like events, classify failure, recommend route/retry/method/outreach, show explainability and policy checks | INFERENCE / HIGH |
| 2 | **Brazil/LatAm Local-Rail Intelligence Layer** | Strong Yuno/Nauta fit if the team understands Brazilian payments; addresses real fragmentation in PIX, installments, boleto, and local methods | Rank methods using context; simulate card-to-PIX migration and provider selection; dashboard conversion/cost rationale | INFERENCE / HIGH |
| 3 | **Agent Payment Mandate Vault** | Distinctive response to Stripe/Nuvei/Gr4vy agentic-payment moves; introduces trust and governance rather than another checkout demo | Create mandates, enforce budgets/allowlists/time windows, simulate a merchant/agent transaction, log approvals and settlement choices | INFERENCE / MEDIUM |
| 4 | **Merchant Recovery Studio** | Extends Yuno NOVA into measurable experimentation; business value is clear through recovered revenue and reduced churn | Campaign builder for WhatsApp/voice alternatives, consent controls, uplift holdout dashboard, language and method suggestions | INFERENCE / HIGH |
| 5 | **Stablecoin-to-Local Payout Optimizer** | Uses the team’s Solana/DeFi background and Yuno’s reported stablecoin rails; targets cross-border payout cost/latency pain | Simulate USDC funding and compliant route selection to PIX/local fiat/eligible wallet; expose FX, fee, ETA, and risk policy | INFERENCE / MEDIUM |

### Recommended build: Local Recovery Graph

**Product statement:** “When a payment fails, Yuno should know why, select the next best local action, obtain or honor consent, and recover the customer intent—not merely rerun the same card.”

**Core flow:**

1. Receive a payment failure event with route, method, issuer/BIN, merchant, amount, currency, device, 3DS, fraud, and local-market context.
2. Use a structured AI classifier to generate a constrained root-cause label and confidence, backed by deterministic rules where required.
3. Rank interventions: alternate PSP, retry timing, 3DS adjustment, alternative local method such as PIX, NOVA outreach, incentive, or human escalation.
4. Apply a policy engine: merchant preferences, user consent, fraud risk, cost ceiling, regulatory country rules, and agent-spend mandate if relevant.
5. Execute only allowed actions; otherwise create an approval task.
6. Measure recovery incrementality with a holdout/control design and surface decision explanations to the merchant.

**Why it is technically feasible in a hackathon:** the team can use mocked payment events, a lightweight rules engine, an LLM only for explanation/classification, a scoring model or heuristics for ranking, and a dashboard demonstrating action simulation and audit logs. The design demonstrates a credible product wedge without requiring production PSP credentials, card data, or regulated money movement. **Classification: INFERENCE. Confidence: HIGH.**

---

## Sources

1. [Yuno — Best Payment Orchestration Platform in 2026](https://y.uno/en/blog/best-payment-orchestration-platforms-in-2026) — 2026-04-22
2. [Yuno — NOVA AI Agents announcement](https://y.uno/newsroom/yuno-launches-nova-ai-agents-to-turn-payment-friction-into-growth-merchants-recover-up-to-75-percent-of-failed-transactions) — 2025-09-16
3. [Yuno — Payments Concierge announcement](https://www.globenewswire.com/news-release/2026/04/06/3268529/0/en/Yuno-Launches-Payments-Concierge-An-Always-On-AI-Agent-for-Payment-Operations.html) — 2026-04-06
4. [Yuno API provider profile](https://apis.io/providers/yuno/) — 2026-08-28
5. [Yuno Web SDK v1.0](https://docs.y.uno/changelog/web-sdk-v1.0-changelog) — 2026-03-01
6. [Stripe — Sessions 2026 announcements](https://stripe.com/blog/everything-we-announced-at-sessions-2026) — 2026-04-29
7. [Stripe — Intelligent payment routing](https://stripe.com/resources/more/intelligent-payment-routing) — 2026-02-18
8. [Adyen — Global acquiring](https://www.adyen.com/global-acquiring) — 2026-08-19
9. [Primer — AI Companion launch coverage](https://www.finextra.com/newsarticle/46920/primer-launches-ai-companion-for-payments-teams) — 2025-11-17
10. [Primer — No-code payment routing](https://primer.io/blog/which-tool-lets-merchants-route-payments-without-writing-code) — 2026-07-20
11. [Spreedly — Spring Release 2026](https://www.spreedly.com/blog/spreedly-spring-release-2026) — 2026-04-01
12. [Spreedly — Payment orchestration](https://www.spreedly.com/landing/payments-orchestration) — 2026-06-05
13. [Gr4vy — Payment orchestration](https://gr4vy.com/lp/payment-orchestration/) — 2026-07-30
14. [Gr4vy — Agentic payments and ADK](https://www.crowdfundinsider.com/2026/04/273770-gr4vy-now-supports-agentic-payments-unveils-agentic-development-kit/) — 2026-04-20
15. [Payrails — AI from clean data to autonomous agents](https://www.payrails.com/blog/ai-at-payrails-from-clean-data-to-autonomous-agents) — 2026-03-12
16. [Payrails — Finance OS positioning](https://www.payrails.com/blog/introducing-the-new-payrails-a-brand-built-for-the-future-of-financial-operations) — 2026-01-12
17. [dLocal — Emerging-market payment processing guide](https://www.dlocal.com/blog/guides/payment-processing-solutions-emerging-markets/) — 2026-07-28
18. [dLocal — Marketplace payments](https://www.dlocal.com/our-industries-v2/marketplace-industry/) — 2026-08-03
19. [EBANX profile — Latin America payment platform](https://www.16idc.com/en-us/provider-detail/ebanx) — 2026-08-02
20. [Rapyd — Products](https://www.rapyd.net/products-2/) — 2026-02-17
21. [Rapyd — Merchant account guide](https://www.rapyd.net/blog/what-is-a-merchant-account/) — 2022-06-11
22. [Nuvei — Q2 2026 Partner Briefing](https://www.nuvei.com/posts/q2-2026-nuvei-partner-briefing) — 2026-05-13
23. [Nuvei — In-agent payment strategy](https://www.nuvei.com/posts/nuvei-completes-first-party-in-agent-payment-with-visa-unveils-merchant-led-agentic-payments-strategy) — 2026-07-02
24. [Solidgate — Ecommerce payment orchestration](https://solidgate.com/solutions/ecommerce/) — 2026-01-22
25. [Hyperswitch — Payment suite](https://docs.hyperswitch.io/about-hyperswitch/payment-suite) — 2026-02-19
26. [Hyperswitch — GitHub repository](https://github.com/juspay/hyperswitch?ref=ossgallery) — 2026-07-10
27. [Yuno Series B/stablecoin rails coverage](https://theindustryspread.com/yuno-45m-series-b-payment-orchestration-stablecoin-rails/) — 2026-08-15

---

## Research Confidence

**Overall confidence:** MEDIUM-HIGH

**Reason:**

The core product and strategy claims rely primarily on current vendor documentation, releases, and developer materials. The competitive categorization, moat assessment, white-space opportunities, and hackathon recommendations are explicitly marked as inferences because vendors use non-standard coverage metrics and public material does not reveal actual pricing, merchant-level performance, implementation quality, or private roadmap details. The recommended next validation step is a corridor-by-corridor scorecard using Yuno sandbox/partner data and interviews with payment operations leaders in Brazil and other target markets.