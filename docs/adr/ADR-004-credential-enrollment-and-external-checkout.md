# ADR-004 — Cadastro obrigatório de credencial e compra em checkout externo

- Status: Aceito
- Data: 2026-08-29
- Escopo: Bound MVP, onboarding de pagamento e evolução para sites reais
- Relacionado: [ADR-001](ADR-001-bound-mvp-architecture.md), [ADR-002](ADR-002-commerce-protocol-layering.md), [ADR-003](ADR-003-agent-identity-assurance.md)

## Contexto

Há dois resultados de produto diferentes que não devem ser apresentados como equivalentes:

1. concluir uma compra no merchant controlado VuelaYa e executar um pagamento no sandbox Yuno;
2. navegar e concluir uma compra em um site externo de produção cujo merchant possui seu próprio adquirente e provedor de pagamento.

Yuno Vault/Payments resolve o primeiro caminho quando VuelaYa é o Merchant of Record. Uma credencial vaulted na conta Yuno do Bound não se torna automaticamente um cartão utilizável no checkout de outro merchant.

AP2 prova autoridade delegada e UCP padroniza commerce e checkout entre participantes integrados. Google Pay pode executar checkout em merchants e superfícies compatíveis. Nenhum desses componentes, isoladamente, entrega ao shopping agent uma credencial portátil para preencher qualquer site legado.

Visa Intelligent Commerce e Mastercard Agent Pay descrevem credenciais específicas/restritas para agentes e controles da rede. Ambos dependem de onboarding. Um projeto genérico no Visa Developer e seus dados mockados de sandbox não significam que o produto restrito Visa Intelligent Commerce foi aprovado, nem permitem uma compra em produção.

## Decisão

### Cadastro obrigatório

Um mandato financeiro não pode ser ativado sem uma credencial `ACTIVE` pertencente ao mesmo principal.

O cadastro ocorre exclusivamente em uma superfície segura do provider, como hosted fields, SDK, iframe, redirect ou fluxo equivalente. Bound, Trusted Surface e TravelBot nunca capturam nem persistem PAN completo, CVV ou segredo reutilizável do provider.

Fora do adapter protegido, Bound armazena somente uma referência lógica e metadados sanitizados:

```ts
type PaymentCredentialReference = {
  credentialId: string
  principalId: string
  provider: "YUNO" | "VISA_VIC" | "MASTERCARD_AGENT_PAY"
  display: string
  status: "PENDING" | "ACTIVE" | "SUSPENDED" | "REVOKED" | "EXPIRED"
}
```

O contrato público pode usar nomes `snake_case`; o exemplo acima descreve o modelo de domínio desejado. A evolução do schema existente será aditiva e versionada no workstream de pagamentos.

As superfícies previstas são:

```text
POST   /v1/payment-methods/enrollment-session
GET    /v1/payment-methods
DELETE /v1/payment-methods/:id
POST   /v1/mandates
```

O endpoint de enrollment cria apenas uma sessão no provider. A confirmação do provider ativa a referência. Remoção ou revogação impede novos mandatos e novas reservas, sem apagar evidências históricas.

### Caminho garantido do MVP

O release gate permanece:

```text
Yuno enrollment
  → credencial lógica ACTIVE
  → mandato AP2
  → VuelaYa UCP checkout assinado
  → Bound ALLOW + reserva de uso único
  → Yuno sandbox payment
  → pedido VuelaYa + receipt
```

Esse caminho prova autorização, isolamento de credencial, execução no provider e auditoria. Ele não será descrito como compra de passagem real nem como compra em site arbitrário.

### Compra em site externo

A compra em um checkout legado de produção será uma rota adicional e gated:

```text
browser executor isolado
  → checkout e preço final do merchant externo
  → checkout snapshot/hash
  → Bound Verify
  → ALLOW + reserva de uso único
  → Payment Instruction e credencial restrita da rede
  → preenchimento seguro do guest checkout
  → HITL para 3DS/Passkey/CAPTCHA quando exigido
  → confirmação do merchant + commerce signal + receipt
```

Regras dessa rota:

- o LLM e o processo de discovery nunca recebem a credencial;
- o executor de checkout recebe capacidade limitada somente depois de `ALLOW`;
- merchant, valor, moeda, checkout hash e expiração ficam ligados à reserva;
- uma mudança de preço ou termos exige novo checkout e nova verificação;
- desafios 3DS, Passkey, OTP ou confirmação explícita pausam para HITL;
- timeout ou navegação ambígua permanece `UNKNOWN` até reconciliação;
- CAPTCHA, bloqueio de bot, login, termos do site e disponibilidade regional podem impedir a rota;
- nenhuma automação com PAN/CVV bruto será usada como fallback.

Visa TAP pode ajudar o merchant a reconhecer o agente, mas não substitui a credencial. Visa VIC é o primeiro candidato técnico para a rota Visa; Mastercard Agent Pay é um adapter futuro e pode ser investigado por meio da Yuno, anunciada como enabling partner na América Latina. Não será alegada interoperabilidade entre tokens VIC e Yuno até validação técnica e comercial.

## Estado de acesso em 2026-08-29

- Um projeto sandbox foi criado no Visa Developer.
- Visa Intelligent Commerce mostra `Product Access Required`; o acesso específico ainda precisa ser solicitado e aprovado.
- Sandbox Visa usa dados mockados e não autoriza compras em sites de produção.
- Não há dependência de Visa ou Mastercard no P0.
- A rota de site real só muda de `gated experiment` para suportada após credencial, onboarding e teste end-to-end comprovados.

## Alternativas rejeitadas

### Guardar cartão diretamente no Bound

Rejeitado. Amplia desnecessariamente o escopo PCI e expõe o sistema a material de pagamento reutilizável.

### Entregar cartão ou token ao TravelBot

Rejeitado. Conteúdo web ou comportamento do LLM poderia contornar mandato, revogação e limites.

### Usar Yuno como cartão universal em sites externos

Rejeitado. Yuno executa o pagamento no contexto do merchant/provider integrado; uma referência vaulted não é automaticamente portátil para outro checkout.

### Tornar a compra externa obrigatória antes do onboarding de rede

Rejeitado. Acesso, autenticação forte, bot protection e produção são riscos externos. VuelaYa + Yuno permanece o fallback determinístico.

## Consequências

- A Trusted Surface precisa oferecer cadastro e gestão de formas de pagamento antes da ativação do mandato.
- BE-09 deve implementar primeiro enrollment e pagamento Yuno para VuelaYa.
- Um adapter VIC/Agent Pay futuro resolve credenciais de checkout externo sem alterar o núcleo do Bound Verify.
- A demonstração diferencia claramente pagamento sandbox, pedido simulado e compra externa real.
- Produção exige processo separado de certificação/onboarding; aprovação de sandbox não é suficiente.

## Critérios de aceitação

1. Mandato financeiro sem credencial ativa do mesmo principal não pode ser ativado.
2. Nenhum payload público, log ou fixture contém PAN, CVV, chave privada ou token reutilizável.
3. A credencial só é resolvida após uma autorização `RESERVED` confirmada.
4. Revogação da credencial bloqueia novas reservas.
5. O caminho P0 completa uma única operação Yuno sandbox e um único pedido VuelaYa.
6. A rota externa permanece desabilitada por padrão até onboarding e teste end-to-end.
7. A UI identifica sem ambiguidade se o resultado é sandbox, merchant controlado ou compra real.
