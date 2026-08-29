# ADR-002 — Separar commerce, autoridade, enforcement e pagamento

- Status: Proposto
- Data: 2026-08-29
- Escopo: Bound MVP e evolução multiprotocolo
- Relacionado: [ADR-001](ADR-001-bound-mvp-architecture.md), [ADR-003](ADR-003-agent-identity-assurance.md), [ADR-004](ADR-004-credential-enrollment-and-external-checkout.md)

## Contexto

Uma compra por agente combina problemas que parecem iguais na interface, mas possuem atores, provas e ciclos de vida diferentes:

- commerce interoperability: descoberta de capacidades, checkout, order e fulfillment;
- reconhecimento do agente pelo merchant;
- prova de que a pessoa delegou uma ação econômica;
- enforcement determinístico dessa autoridade no estado atual;
- resolução de uma credencial de pagamento;
- processamento, roteamento e liquidação financeira.

Tratar AP2 como protocolo de catálogo/checkout ou tratar UCP como payment rail acoplaria responsabilidades diferentes. Da mesma forma, expor Yuno Agent Toolkit, um token de rede ou uma carteira diretamente ao shopping agent criaria um caminho de pagamento que contorna o Bound.

O ecossistema também não converge para um único protocolo. UCP possui extensão AP2 nativa; ACP possui seus próprios artefatos de delegated payment; Visa TAP reconhece agentes sobre HTTP existente; Visa Intelligent Commerce fornece credenciais e controles da rede Visa; x402 atende pagamentos HTTP nativos para APIs e recursos digitais.

## Decisão

Bound adotará uma arquitetura multiprotocolo com modelos internos normalizados. Nenhum protocolo externo será o modelo de domínio do produto.

### Camadas

| Camada | Decisão |
|---|---|
| Commerce | UCP é o adapter P0. ACP e browser legacy são adapters futuros. |
| Agent recognition | Assinatura do agente é obrigatória; Visa TAP é um adapter futuro para merchant legacy. |
| Authorization proof | AP2 é o proof P0. Visa Payment Instruction e ACP allowance poderão ser normalizados por adapters próprios. |
| Enforcement | Bound Verify é a única função que produz `ALLOW`, `ESCALATE` ou `DENY`. |
| Credential | Yuno Vault é o provider P0. Visa VIC é um provider/controle futuro, condicionado a acesso e interoperabilidade. |
| Payment execution | Yuno é o executor P0, server-side e após reserva. Outros executors são possíveis sem alterar Verify. |
| Rails | Visa, Mastercard, PIX, wallets e PSPs permanecem abaixo de Yuno ou do executor selecionado. |

O cadastro obrigatório da credencial, a distinção entre pagamento sandbox e compra externa real e os gates de Visa VIC/Mastercard Agent Pay estão definidos no [ADR-004](ADR-004-credential-enrollment-and-external-checkout.md).

### Caminho P0

```text
TravelBot
  ↓ UCP discovery + checkout
VuelaYa
  ↓ merchant-signed checkout + AP2 extension
Bound Verify
  ↓ ALLOW + reserved authorization
Yuno Vault/Payments
  ↓
provider / network / issuer
```

VuelaYa publicará `/.well-known/ucp`, fixará o snapshot UCP `2026-08-25` e implementará o subconjunto de Catalog/Checkout/Order necessário ao vertical. A capability `dev.ucp.common.payment.ap2_mandate` estenderá `dev.ucp.shopping.checkout` e será negociada por capability intersection. Quando ativa, o checkout protegido não poderá fazer downgrade silencioso para um fluxo sem mandato.

### Contratos internos

```ts
interface CommerceProtocolAdapter {
  discoverProfile(merchant: URL): Promise<MerchantCapabilities>
  createCheckout(intent: PurchaseIntent): Promise<NormalizedCheckout>
  completeCheckout(input: AuthorizedCheckout): Promise<OrderReceipt>
}

interface AuthorizationProofAdapter {
  verify(proof: unknown, checkout: NormalizedCheckout): Promise<NormalizedAuthorization>
}

interface PaymentCredentialAdapter {
  resolve(reference: string, authorization: ReservedAuthorization): Promise<PaymentInstrument>
}

interface PaymentExecutor {
  pay(input: AuthorizedPayment, idempotencyKey: string): Promise<PaymentResult>
}
```

`NormalizedCheckout` conserva merchant, items, fulfillment, amount, currency, expiry, authoritative totals, checkout hash and protocol metadata. `NormalizedAuthorization` conserva principal, agent, merchant constraints, checkout binding, scope, amount, expiry, usage and proof provenance.

Adapters validate cryptography and schema before normalization. Normalization never weakens a constraint, fills missing authority permissively or converts an unknown rule into `ALLOW`.

### Visa legacy route

Visa TAP and Visa Intelligent Commerce are complementary, not replacements for AP2/Yuno in P0:

- TAP supplies signed agent recognition and linked payment/consumer containers over existing HTTP infrastructure;
- VIC provisions agent-specific Visa credentials, authenticates Payment Instructions and applies network-level controls;
- Bound continues to enforce its normalized policy before credential resolution;
- VIC availability, Agent Provider onboarding and token interoperability with Yuno are explicit spike gates.

If the VIC credential is confirmed compatible with Yuno's external network-token flow, Yuno may remain the executor. Until that is proven, VIC is modeled as a separate credential/execution route for legacy Visa checkout. We will not claim interoperability from marketing compatibility statements alone.

### ACP and x402

An ACP adapter will validate ACP's native delegated proof and map it to `NormalizedAuthorization`; it will not wrap every ACP transaction in AP2 without a protocol requirement.

x402 belongs to machine-to-machine API/tool payments. It will use a separate budget category and credential adapter if implemented. It is not the primary consumer flight rail and does not replace Yuno.

## Alternatives considered

### AP2 as the only protocol

Rejected. AP2 explicitly leaves catalog, checkout APIs and commerce lifecycle to a commerce protocol. It also does not solve legacy merchant recognition or payment orchestration alone.

### Visa as the only authority and credential system

Rejected. It improves existing-web recognition and Visa credential portability, but would couple Bound's authority model to one payment network and market/onboarding availability.

### Expose Yuno Agent Toolkit directly to TravelBot

Rejected. A general payment tool would bypass deterministic verification and credential isolation. Any use of the toolkit remains inside the server-side Yuno adapter.

### One universal proof envelope for every protocol

Rejected. Re-signing external proofs as if they were AP2 can hide semantic differences and create contradictory sources of truth. Bound stores the original proof type and verification evidence.

### Browser automation as the P0 checkout protocol

Rejected. Browser automation is valuable for discovery and demo visibility but is brittle, may be blocked, and cannot safely receive raw payment credentials. The controlled UCP merchant remains the fallback and release gate.

## Consequences

### Positive

- Bound is not tied to Google, Visa, OpenAI or a single payment rail.
- UCP/AP2 remains the shortest standards-based path for a deterministic hackathon demo.
- Visa can extend reach to existing web infrastructure without contaminating the P0 path.
- Yuno stays the primary orchestration and payment integration for the challenge.
- Protocol-specific cryptography is isolated from policy and transaction state.

### Negative

- Normalized contracts require careful semantic mapping and versioning.
- Each adapter needs conformance, negative and downgrade tests.
- Visa and ACP routes may duplicate controls already represented by AP2; precedence must be explicit.
- Some token/provider combinations require commercial onboarding, not only code.

## Acceptance criteria

1. The P0 vertical completes with UCP + AP2 + Bound + Yuno and no Visa dependency.
2. `Bound Verify` receives only normalized, schema-valid checkout and proof inputs.
3. A proof adapter cannot produce an authorization broader than its source artifact.
4. Payment credential resolution occurs only after a `RESERVED` authorization.
5. A Visa/ACP/x402 adapter can be disabled without changing P0 behavior.
6. A legacy browser never receives Yuno secrets, reusable vaulted tokens or Bound signing keys.
7. Documentation labels unproven vendor-token interoperability as a spike, not a supported path.

## References

- [UCP overview](https://ucp.dev/specification/overview/)
- [UCP Checkout](https://ucp.dev/specification/shopping/checkout/)
- [UCP AP2 Mandates extension](https://ucp.dev/specification/payment/extensions/ap2-mandates/)
- [AP2 specification](https://github.com/google-agentic-commerce/AP2/blob/main/docs/ap2/specification.md)
- [Yuno payment method enrollment](https://docs.y.uno/docs/payment-features/enrollment/enroll-payment-methods)
- [Yuno network tokens](https://docs.y.uno/docs/security-and-compliance/network-tokens)
- [Visa Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications/)
- [Visa Intelligent Commerce](https://developer.visa.com/capabilities/visa-intelligent-commerce/overview)
- [ACP specification](https://github.com/agentic-commerce-protocol/agentic-commerce-protocol)
- [x402 documentation](https://docs.cdp.coinbase.com/x402/welcome)

## Reference visual

The responsibility stack and adapter routes are in [`../diagrams/bound-protocol-model.html`](../diagrams/bound-protocol-model.html). The source-of-funds explanation and integration links are in [`../payment-methods-and-purchase-routes.md`](../payment-methods-and-purchase-routes.md).
