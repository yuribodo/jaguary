# Nauta — Technical Architecture Deep Research

**Entity:** Nauta / Yuno / NextWave  
**Research date:** 2026-08-29  
**Researcher:** Perplexity  
**Status:** Final

---

## Executive Findings

### 1. Nauta appears to be building a Kotlin/Vert.x + Kafka-based ingestion and orchestration layer on AWS, with Python ML workers and PostgreSQL/NoSQL storage.

**Classification:** FACT + INFERENCE  
**Confidence:** MEDIUM-HIGH

A backend engineer's public profile states he designed and built Kotlin/Vert.x ingestion pipelines on Kafka for Nauta, enabling real-time supply-chain visibility and entity orchestration, and also architected an inventory module using CQRS with PostgreSQL plus a Python worker with Monte Carlo simulation and XGBoost forecasting.[web:107] A Head of Engineering job description references backend-heavy systems with microservices, async/event-driven architectures, data ingestion pipelines, and production systems on AWS, with a tech-stack context of Kotlin and Python backend, PostgreSQL and MongoDB/NoSQL data, and AWS containers/CI/CD/observability.[web:108] That combination strongly suggests an event-driven, microservices architecture on AWS with Kafka as the central event bus.[web:107][web:108]

**Sources:**
- [Daniel Castillo - Software Engineer - Backend - Nauta | Himalayas](https://himalayas.app/@danielcastillo2)
- [BreakmarkHR hiring Head of Engineering in Latin America | LinkedIn](https://www.linkedin.com/jobs/view/head-of-engineering-at-breakmarkhr-4374251024)

---

### 2. Nauta's moat appears to be its proprietary, company-specific operational data layer built from ERP, TMS, WMS, email, spreadsheets, portals, and documents, not generic AI models.

**Classification:** FACT + INFERENCE  
**Confidence:** HIGH

Multiple sources describe Nauta as ingesting unstructured, semi-structured, and structured data from ERP, TMS, WMS, emails, spreadsheets, supplier portals, and PDFs into a single AI-native data layer without requiring customers to clean data first or stand up data pipelines.[web:119][web:120][web:123] Leadership and investors emphasize that AI agents will commoditize and the real moat is the data foundation underneath them, with Nauta unifying fragmented operational data to create a living model of how each company operates.[web:4][web:53] That implies the technically strategic asset is the normalized, SKU-level operational graph and event history, not the LLMs or models alone.[web:4][web:15][web:53]

**Sources:**
- [The Disruptions You Already Saw Coming: Why Supply Chain Signals Get Lost](https://www.getnauta.com/blog/post/why-supply-chain-signals-get-lost)
- [Nauta vs o9 Solutions: Which Supply Chain Planning Platform Fits Better?](https://www.getnauta.com/vs/o9-solutions)
- [Nauta vs Loop: Which Supply Chain Automation Platform Fits Better?](https://www.getnauta.com/vs/loop)
- [AI for Supply Chain Needs 3 Things: Goods, Data, Money](https://www.freightwaves.com/news/ai-for-supply-chain-needs-3-things-goods-data-money)
- [AI Agents for Global Supply Chains: Why We Invested in Nauta](https://www.bmwiventures.com/news/ai-agents-for-global-supply-chains-why-we-invested-in-nauta)
- [Nauta Inventory Optimization Engine: Prevent Stockouts](https://www.getnauta.com/blog/post/nauta-inventory-optimization-engine-how-real-time-sku-level-intelligence-helps-shippers-avoid-holiday-stockouts)

---

### 3. Public API and developer-tool evidence is minimal; the platform appears designed for guided, integration-assisted deployment rather than self-serve API-first adoption.

**Classification:** FACT + INFERENCE  
**Confidence:** MEDIUM

Nauta's public site and materials repeatedly emphasize connecting in under 20 IT hours and going live in under 60 days, but do not expose public API docs, SDKs, or a developer portal in the retrieved sources.[web:123][page:1] The Head of Engineering job lists integrations via REST, async pipelines, and SFTP, and the company says it connects to existing systems via API or no-code workflows, which suggests APIs exist but are not currently positioned as a primary external developer surface.[web:108][web:109][web:120] For a hackathon team, this implies realistic extension points are more likely to be workflow agents and data-layer use cases than deep custom API integrations built from scratch.[web:47][web:123]

**Sources:**
- [Nauta vs Loop: Which Supply Chain Automation Platform Fits Better?](https://www.getnauta.com/vs/loop)
- [Nauta — The operational brain for your supply chain](https://www.getnauta.com/)
- [BreakmarkHR hiring Head of Engineering in Latin America | LinkedIn](https://www.linkedin.com/jobs/view/head-of-engineering-at-breakmarkhr-4374251024)
- [Nauta: The AI-Powered Logistics Orchestration Platform for the Global Supply Chain Industry](https://www.constructcap.com/articles/nauta-the-ai-powered-logistics-orchestration-platform-for-the-global-supply-chain-industry)
- [Nauta vs o9 Solutions: Which Supply Chain Planning Platform Fits Better?](https://www.getnauta.com/vs/o9-solutions)
- [AI Workforce](https://www.getnauta.com/ai-workforce)

---

## Detailed Research

### Core technical infrastructure Nauta appears to own

Based on the available evidence, Nauta appears to own and operate the following technical infrastructure components:

| Component | Evidence | Confidence |
|---|---|---|
| Ingestion and orchestration pipelines | Backend engineer describes Kotlin/Vert.x ingestion pipelines on Kafka for real-time visibility and entity orchestration.[web:107] | HIGH |
| Event bus / streaming layer | Kafka explicitly mentioned for ingestion pipelines; job description references async/event-driven architectures.[web:107][web:108] | HIGH |
| Relational data store | PostgreSQL mentioned for inventory module with CQRS pattern.[web:107] | HIGH |
| NoSQL / document store | Job description lists MongoDB/NoSQL alongside PostgreSQL.[web:108] | MEDIUM |
| ML / forecasting workers | Python inventory-calculator-worker with Monte Carlo simulation and XGBoost-based demand forecasting.[web:107] | HIGH |
| Cloud infrastructure | Job description specifies experience running production systems on AWS; containers, CI/CD, observability called out.[web:108] | HIGH |
| Document intelligence pipeline | "Prisma" AI document intelligence pipeline for OCR + LLM extraction from trade documents.[web:107] | MEDIUM |
| AI agent execution layer | Around 20 autonomous agents running across supplier, inventory, and logistics workflows; described as acting on the operational brain.[web:47][web:22] | HIGH |

What is not visible in the retrieved sources includes specific container orchestration technology (EKS vs ECS vs other), specific observability stack, specific identity and access management details beyond SOC 2 Type II claims, and any public API specification or SDK.[web:48][page:1]

### Integration surface and data sources

Nauta repeatedly says it connects to:

- **Enterprise systems:** ERP, TMS, WMS.[web:119][web:120][web:15]
- **Communication channels:** Email, spreadsheets, supplier portals, partner platforms.[web:119][web:122][page:1]
- **Logistics data:** Carrier portals, broker systems, port and maritime data, shipment tracking feeds.[web:49][web:32][page:1]
- **Documents:** Invoices, POs, packing lists, bills of lading, customs and tariff documents.[web:48][web:4][web:107]

The integration model is described as sitting on top of existing systems rather than replacing them, with connections established in days to weeks and no requirement for customers to build their own data pipelines first.[web:43][web:120][web:123] The Head of Engineering job mentions REST, async pipelines, and SFTP as integration patterns, which suggests a mix of real-time APIs, batch/file-based ingestion, and event-driven flows.[web:108]

### Data requirements and data moat

Nauta needs:

- **Transactional data:** Purchase orders, shipments, inventory positions, invoices, contracts, terms.[web:15][web:49][web:4]
- **Operational signals:** Shipment status updates, ETA revisions, port and lane performance, carrier and supplier performance history.[web:49][page:1]
- **Unstructured context:** Emails, spreadsheets, PDFs, portal updates, tribal rules and playbooks encoded as operational logic.[web:119][web:112][web:4]

The moat appears to be the **operational brain**: a company-specific, SKU-level data model that compounds knowledge from every transaction, exception, and decision over time.[web:53][web:4][web:122] Leadership explicitly says AI agents will commoditize and the real moat is the data foundation underneath them, while investor materials describe Nauta as unifying fragmented operational data to create a living model of how a company operates.[web:4][web:53] That implies the strategically important data is:

- Normalized, cross-system operational records at SKU and shipment level.[web:15][web:49]
- Historical exception patterns, supplier and lane performance, contract terms, and cost structures.[web:48][page:1]
- Decision logs and outcomes that allow agents to learn which actions protect fill rate, margin, and cash flow.[web:53][web:112]

### Probable high-level architecture (inferred)

The following architecture is an **INFERENCE** based on job descriptions, engineer profiles, and product descriptions. It should be treated as a reasoned hypothesis, not a confirmed blueprint.

#### Ingestion layer

- **Kotlin/Vert.x services** ingest data from ERP, TMS, WMS, email, spreadsheets, portals, and documents via REST, SFTP, and async pipelines.[web:107][web:108]
- **Kafka topics** act as the central event bus for shipment events, order events, inventory events, document events, and cost events.[web:107][web:108]
- **Prisma document pipeline** performs OCR and LLM-based extraction to convert PDFs and images into structured trade records.[web:107]

#### Context and data layer

- **Event processors** normalize incoming events into a unified operational model at SKU, PO, shipment, and supplier level.[web:15][web:49][web:119]
- **PostgreSQL** stores structured operational state, likely using CQRS patterns for inventory and other domains.[web:107]
- **MongoDB/NoSQL** likely stores semi-structured documents, raw events, or agent state where schema flexibility is needed.[web:108]
- **Context engine** compounds operational knowledge over time, encoding business rules, playbooks, and exception-handling logic as described in leadership essays.[web:112][web:53]

#### AI and agent layer

- **Python ML workers** run forecasting and simulation workloads such as Monte Carlo stockout prediction and XGBoost demand forecasting.[web:107]
- **LLM-powered workflows** are listed in the job description as part of data & AI capabilities, suggesting LLMs are used for document understanding, communication drafting, and possibly decision support.[web:108]
- **Agent orchestrator** dispatches named agents (Marcus, Nina, Vera, etc.) to monitor specific domains and execute bounded workflows under human-in-the-loop guardrails.[web:47][page:1]

#### Execution and integration layer

- **Action services** push updates and actions back into ERP, TMS, WMS, and communication channels (Slack, Teams, WhatsApp, SMS, email, voice).[page:1][web:32]
- **Exception engine** ranks issues by financial and service impact and routes only material decisions to humans.[web:33][page:1]
- **APIs and no-code workflows** allow configuration and limited extension, though public API docs are not visible in the retrieved sources.[web:109][web:120]

#### Infrastructure and operations

- **AWS** is explicitly mentioned as the production environment in the Head of Engineering job description.[web:108]
- **Containers, CI/CD, observability** are called out as required infrastructure capabilities.[web:108]
- **SOC 2 Type II** certification is claimed, indicating formal security and compliance controls around data handling and access.[web:48][page:1]

### APIs, SDKs, and developer capabilities

Public evidence for APIs and developer tools is limited:

- The site says Nauta connects to internal systems **via API or no-code workflows**, which implies some API surface exists.[web:109]
- The Head of Engineering job lists **REST, async pipelines, SFTP** as integration patterns, suggesting backend APIs and file-based integrations.[web:108]
- No public API documentation, SDKs, or developer portal were visible in the retrieved sources.[web:32][page:1]
- The product is positioned as deployable in under 60 days and connecting in under 20 IT hours, which suggests guided integration rather than self-serve API onboarding.[web:123][page:1]

**INFERENCE:** For a hackathon team, the most realistic developer capabilities to extend are likely:

- New agent workflows on top of the existing data layer (e.g., payment-linked invoice agents, cash-flow escalation agents).[web:47][web:4]
- Data transformations and decision logic that operate on the unified operational model.[web:119][web:123]
- Possibly internal or partner APIs if Nauta exposes them for hackathon participants, but this cannot be confirmed from public sources.[web:30]

### AI infrastructure and LLM usage

Evidence for AI infrastructure includes:

- **LLM-powered workflows** are explicitly listed in the Head of Engineering job description under Data & AI.[web:108]
- **Prisma AI document intelligence** uses OCR + LLM extraction for trade documents.[web:107]
- Leadership essays describe encoding decision logic and tribal knowledge so AI can observe end-to-end flows, not just individual touchpoints.[web:112]
- Investor materials describe agents that reason, decide, and execute in real time on top of a unique, domain-specific data layer.[web:53]

**INFERENCE:** Nauta likely uses a combination of:

- **LLMs** for document understanding, communication drafting, and possibly decision explanation.[web:107][web:108]
- **Traditional ML** (e.g., XGBoost) and simulation (Monte Carlo) for forecasting and risk modeling.[web:107]
- **Rules and playbooks** encoded as operational logic that agents follow under defined guardrails.[web:112][page:1]

### Security, authentication, and enterprise architecture

Security-related evidence:

- Nauta claims **SOC 2 Type II** certification and describes enterprise-grade security and data protection for sensitive supply-chain data.[web:48][page:1]
- The platform is described as sitting securely over existing ERP, WMS, and TMS with no data duplication or complex migrations, which suggests a security model focused on access control and encryption rather than data replication.[page:1]
- The Head of Engineering job implies production-grade observability, CI/CD, and containerized infrastructure on AWS, which typically includes IAM, network segmentation, logging, and monitoring.[web:108]

Authentication specifics (OAuth, SSO, SAML, etc.) are not detailed in the retrieved sources, so any claims about specific protocols would be speculation.[web:48][page:1]

### Critical questions

#### 1. What technical infrastructure does Nauta appear to own?

**FACT:** Nauta appears to own ingestion and orchestration pipelines in Kotlin/Vert.x on Kafka, Python ML workers, PostgreSQL and NoSQL stores, an AI agent execution layer, and production infrastructure on AWS with containers, CI/CD, and observability.[web:107][web:108] **INFERENCE:** It likely owns a context engine that encodes operational rules and playbooks, plus action services that push updates back into customer systems and communication channels.[web:53][page:1]

#### 2. What does it integrate with?

**FACT:** Nauta integrates with ERP, TMS, WMS, email, spreadsheets, supplier portals, carrier and broker systems, and trade documents such as invoices, POs, and bills of lading.[web:119][web:120][web:15][web:48] **INFERENCE:** It likely integrates with communication tools such as Slack, Teams, WhatsApp, SMS, and email for alerts and operational messages, given the emphasis on exception-based operations and multi-channel communication.[page:1][web:32]

#### 3. What data does it need?

**FACT:** Nauta needs purchase orders, shipment and inventory data, invoices and contracts, carrier and supplier performance signals, and unstructured communications and documents.[web:15][web:49][web:4][web:119] **INFERENCE:** It also benefits from historical decision logs and outcomes so agents can learn which actions protect fill rate, margin, and cash flow over time.[web:53][web:112]

#### 4. What data appears to be its moat?

**FACT:** Leadership and investors explicitly state that the moat is the data foundation underneath AI agents, not the models themselves.[web:4][web:53] **INFERENCE:** The moat data is the normalized, SKU-level operational graph that unifies ERP, TMS, WMS, email, spreadsheets, and documents into one live model, plus the accumulated exception history and decision outcomes that make agents more useful over time.[web:15][web:122][web:53]

#### 5. What APIs or developer capabilities could a hackathon team use?

**FACT:** Public API documentation and SDKs are not visible in the retrieved sources.[web:32][page:1] **INFERENCE:** A hackathon team is most likely to extend Nauta via:
- New agent workflows that operate on the existing operational data layer.[web:47][web:123]
- Decision logic and data transformations that plug into the context engine.[web:119][web:112]
- Possibly internal or partner APIs if Nauta exposes them for hackathon participants, but this cannot be confirmed from public evidence.[web:30]

#### 6. What technical capabilities could a hackathon team realistically extend?

**FACT:** Nauta already runs agents for inventory watch, shipment watch, supplier reliability, freight anomaly, landed cost, and related workflows.[web:47][page:1] **INFERENCE:** Realistic extension areas for a hackathon include:
- Payment-linked invoice and PO reconciliation agents that connect Yuno payment events with Nauta's invoice and freight-audit workflows.[web:4][web:48]
- Cash-flow and working-capital agents that use shipment and inventory intelligence to trigger smarter financing or procurement actions.[web:33][web:15]
- Exception-resolution agents for importer finance teams, such as dispute filing, supplier follow-up, and landed-cost approval loops.[page:1][web:42]

---

## Risks / Weaknesses

1. **Limited public technical detail:** Most architectural evidence comes from job descriptions and one engineer's profile, not official architecture docs or engineering blogs.[web:107][web:108]
2. **API openness unclear:** The absence of public API docs or SDKs suggests the platform may still be relatively closed or integration-assisted, which limits hackathon extensibility.[web:32][page:1]
3. **Dependency on data quality:** The moat thesis depends on clean-enough operational data; messy onboarding data or poor integration quality could limit agent effectiveness.[web:120][web:123]

---

## Unknowns

Important things we still don't know:

- Exact cloud architecture (EKS vs ECS vs other), specific observability stack, and detailed security controls beyond SOC 2 claims.[web:48][web:108]
- Public API surface, rate limits, authentication mechanisms, and developer documentation.[web:32][page:1]
- How much of the agent behavior is fully autonomous versus human-in-the-loop across different workflows.[page:1][web:33]

---

## Contradictions

Document conflicting information:

### Degree of autonomy vs human control

Source A says agents reason, decide, and execute in real time, and some marketing language implies autonomous execution across workflows.[web:53][web:48][web:33]

Source B says "Agents act. Humans decide" and explicitly notes that nothing ships, cancels, or commits without customer approval.[page:1]

### Assessment

The strongest synthesis is that Nauta automates routine and bounded workflow steps, but keeps high-stakes commercial or operational commitments under human control.[page:1][web:53]

---

## Important Quotes

> "AI agents will be commoditized in months. In supply chain, the real moat is the data foundation underneath them."

**Speaker:** Valentina Jordan, CEO and Co-Founder of Nauta  
**Date:** 2026-08-25  
**Source:** [AI for Supply Chain Needs 3 Things: Goods, Data, Money](https://www.freightwaves.com/news/ai-for-supply-chain-needs-3-things-goods-data-money)

---

> "Nauta unifies fragmented operational data to create a living model of how a company operates and deploys a workforce of AI agents that reason, decide and execute in real-time."

**Speaker:** BMW i Ventures  
**Date:** 2026-08  
**Source:** [AI Agents for Global Supply Chains: Why We Invested in Nauta](https://www.bmwiventures.com/news/ai-agents-for-global-supply-chains-why-we-invested-in-nauta)

---

> "Designed and built Kotlin/Vert.x ingestion pipelines on Kafka for a B2B logistics platform, enabling real-time supply chain visibility and end-to-end trade entity orchestration."

**Speaker:** Daniel Castillo, Backend Software Engineer at Nauta  
**Date:** 2026-08-29 accessed  
**Source:** [Daniel Castillo - Software Engineer - Backend - Nauta | Himalayas](https://himalayas.app/@danielcastillo2)

---

## Sources

1. [Daniel Castillo - Software Engineer - Backend - Nauta | Himalayas](https://himalayas.app/@danielcastillo2) — accessed 2026-08-29
2. [BreakmarkHR hiring Head of Engineering in Latin America | LinkedIn](https://www.linkedin.com/jobs/view/head-of-engineering-at-breakmarkhr-4374251024) — accessed 2026-08-29
3. [AI for Supply Chain Needs 3 Things: Goods, Data, Money](https://www.freightwaves.com/news/ai-for-supply-chain-needs-3-things-goods-data-money) — 2026-08-25
4. [AI Agents for Global Supply Chains: Why We Invested in Nauta](https://www.bmwiventures.com/news/ai-agents-for-global-supply-chains-why-we-invested-in-nauta) — accessed 2026-08-29
5. [The Disruptions You Already Saw Coming: Why Supply Chain Signals Get Lost](https://www.getnauta.com/blog/post/why-supply-chain-signals-get-lost) — accessed 2026-08-29
6. [Nauta vs o9 Solutions: Which Supply Chain Planning Platform Fits Better?](https://www.getnauta.com/vs/o9-solutions) — accessed 2026-08-29
7. [Nauta vs Loop: Which Supply Chain Automation Platform Fits Better?](https://www.getnauta.com/vs/loop) — accessed 2026-08-29
8. [Nauta Inventory Optimization Engine: Prevent Stockouts](https://www.getnauta.com/blog/post/nauta-inventory-optimization-engine-how-real-time-sku-level-intelligence-helps-shippers-avoid-holiday-stockouts) — accessed 2026-08-29
9. [Nauta's Inventory Agent Marcus turns demand and data into intelligence and action](https://www.getnauta.com/blog/post/nauta-s-inventory-agent-marcus-turns-demand-and-data-into-intelligence-and-action) — accessed 2026-08-29
10. [Nauta — The operational brain for your supply chain](https://www.getnauta.com/) — accessed 2026-08-29
11. [AI Workforce](https://www.getnauta.com/ai-workforce) — accessed 2026-08-29
12. [Nauta: Deployed | AI Agents That Act](https://ai-workforce.getnauta.com/) — accessed 2026-08-29
13. [Nauta: The AI-Powered Logistics Orchestration Platform for the Global Supply Chain Industry](https://www.constructcap.com/articles/nauta-the-ai-powered-logistics-orchestration-platform-for-the-global-supply-chain-industry) — 2025-08-26
14. [AI in Supply Chain 2026: Why the Real Transformation Is Still Ahead of Us](https://www.getnauta.com/blog/post/ai-in-supply-chain-2026-why-the-real-transformation-is-still-ahead-of-us) — accessed 2026-08-29

---

## Research Confidence

**Overall confidence:** MEDIUM-HIGH

**Reason:** The core technology stack (Kotlin/Vert.x, Kafka, PostgreSQL, Python ML, AWS) is reasonably well supported by engineer profiles and job descriptions, and the data-moat thesis is strongly supported by multiple leadership and investor statements.[web:107][web:108][web:4][web:53] Confidence is lower on specific architectural details such as container orchestration, observability stack, API design, and security implementation because those are not publicly documented in the retrieved sources.[web:32][page:1]