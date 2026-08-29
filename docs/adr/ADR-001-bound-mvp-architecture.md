# ADR-001 — Arquitetura transacional do MVP Bound

- Status: Proposto
- Data: 2026-08-29
- Escopo: Hackathon Yuno × Nauta NextWave 2026
- Origem: `Bound — Product Requirements.pdf`, versão 0.1

## Contexto

O Bound precisa responder de forma verificável à pergunta: “este agente, representando esta pessoa, pode executar esta compra exata agora?”. A resposta antecede o pagamento e precisa permanecer independente do mecanismo usado pela Yuno para processá-lo.

O MVP tem quatro requisitos que dominam a arquitetura:

1. a decisão financeira deve ser determinística e não pode depender de LLM;
2. revogação, limite agregado, frequência, nonce e replay precisam refletir o estado mais recente;
3. uma autorização concorrente não pode ultrapassar limites nem gerar duas cobranças;
4. o agente não pode receber PAN, CVV ou `vaulted_token` da Yuno.

O fluxo demonstrado será uma compra autônoma de passagem. Inventário, merchant e preços podem ser simulados; assinatura do agente, estado do mandato, revogação, verificação, integração Yuno e trilha de auditoria devem ser reais dentro das limitações do sandbox.

## Direcionadores da decisão

- Entregar um vertical funcional em tempo de hackathon.
- Falhar fechado diante de estado, assinatura ou resposta de pagamento ambíguos.
- Tornar os casos de trial-by-fire repetíveis e fáceis de explicar.
- Evitar concorrência distribuída onde atomicidade local resolve o problema.
- Preservar portas claras para separar AP2, persistência, assinatura e Yuno no futuro.
- Manter o caminho para uma arquitetura de produção sem fingir que o MVP já é PCI-compliant.

## Decisão

Implementaremos o Bound como um monólito modular transacional em TypeScript, com API HTTP, núcleo de autorização puro, PostgreSQL como fonte de verdade e um adaptador Yuno isolado atrás de uma autorização reservada.

O deploy inicial terá dois artefatos:

- `bound-web`: Trusted Surface e telas de merchant/auditoria;
- `bound-api`: processo único com os módulos `identity`, `mandates`, `checkouts`, `verify`, `payments` e `ledger`.

O código poderá viver num monorepo, mas `bound-api` continuará sendo um único deployable no MVP. As fronteiras entre módulos serão interfaces internas, não chamadas de rede.

### Stack de referência

- TypeScript no frontend e backend.
- Next.js para a Trusted Surface e visualizações da demo.
- Fastify para a API HTTP.
- PostgreSQL para estado transacional, nonces, reservas e auditoria.
- `jose` para JWS/JWT ES256 e `zod` para validação de schemas.
- Merchant fictício VuelaYa com API determinística para o caminho P0.
- Firecrawl Search/Scrape/Interact encapsulado por `DiscoveryPort` para o browser ao vivo P2.
- Cliente HTTP direto da Yuno encapsulado por `YunoPaymentPort`; o Agent Toolkit não será exposto ao TravelBot.
- `SignerPort` com chave local de desenvolvimento no hackathon e implementação KMS/HSM em produção.

Versões específicas ficam fora deste ADR e devem ser fixadas no lockfile do projeto.

### Fronteiras e módulos

| Módulo | Responsabilidade | Não pode fazer |
|---|---|---|
| Trusted Surface | Exibir a política estruturada e capturar consentimento humano | Autorizar silenciosamente ou expor segredo de pagamento |
| Identity | Registrar chaves públicas e validar assinatura/estado do agente | Aceitar identidade declarada sem prova criptográfica |
| Mandates | Criar, assinar, consultar, expirar e revogar mandatos AP2 | Alterar um mandato já assinado |
| Discovery | Procurar/extrair ofertas e, no P2, operar uma sessão Firecrawl com live view | Autorizar, assinar checkout ou possuir ferramenta/credencial de pagamento |
| Checkouts | Validar assinatura do merchant e calcular hash canônico | Confiar em preço ou itens enviados apenas pelo agente |
| Verify | Executar regras puras e produzir `ALLOW`, `ESCALATE` ou `DENY` | Chamar LLM ou Yuno durante a avaliação |
| Authorization Store | Serializar nonce, limite, reserva e consumo | Usar cache eventualmente consistente como fonte de verdade |
| Yuno Adapter | Resolver a referência interna, chamar Yuno e normalizar o resultado | Retornar `vaulted_token` ao agente ou merchant |
| Ledger | Registrar eventos append-only encadeados por hash | Ser descrito como blockchain ou prova externa de imutabilidade |

### Caminho de autorização

1. A Trusted Surface transforma a intenção em uma proposta estruturada. Um LLM pode ajudar somente nessa interpretação.
2. A pessoa revisa todos os campos determinísticos e confirma. O backend assina e persiste os mandatos AP2 abertos.
3. O agente recebe o mandato/prova, encontra a oferta pelo catálogo VuelaYa (P0) ou pelo `DiscoveryPort`/Firecrawl (P2) e envia somente a intenção ao merchant.
4. O merchant assina um checkout fechado com `checkout_id`, itens, valor, moeda e metadados relevantes.
5. `POST /verify` valida schema, assinatura do agente, vínculo do mandato, assinatura/hash do checkout, janela de tempo, revogação, escopo, limites, frequência e replay.
6. Se o resultado calculado for `ALLOW`, a mesma transação PostgreSQL registra o nonce e cria uma autorização `RESERVED`. Limites consideram autorizações `RESERVED`, `PAYMENT_PENDING` e `CONSUMED` para impedir corrida e split payment.
7. `POST /authorizations/:id/pay` faz uma transição atômica de `RESERVED` para `PAYMENT_PENDING` e chama a Yuno fora da transação de banco, usando `authorization_id` como chave de idempotência.
8. Sucesso confirmado muda a autorização para `CONSUMED`, consolida uso/valor e sela os receipts. Falha terminal muda para `FAILED` e libera a reserva. Resposta desconhecida permanece `PAYMENT_PENDING` e bloqueia nova tentativa com outra chave até reconciliação.
9. Cada transição grava um evento de auditoria no mesmo commit que altera o estado de negócio.

`ESCALATE` não cria autorização pagável. “Approve once” cria um novo mandato fechado, ligado ao `checkout_id`, com uma utilização e expiração curta, que percorre novamente a verificação.

### Discovery e browser ao vivo

Discovery é uma porta substituível e não uma dependência do domínio Bound:

```ts
interface DiscoveryPort {
  findOffers(query: OfferQuery): Promise<OfferCandidate[]>;
}
```

O adapter P0 chama `GET /api/flights` no merchant fictício VuelaYa e mantém a demo reproduzível. O adapter P2 usa Firecrawl para Search/Scrape e `/interact`, retornando candidatos estruturados, URL/proveniência e `liveViewUrl`. A sessão pode navegar e preencher a interface do merchant, mas a ação final disponível ao agente é `requestPurchase(candidate)`; ela produz uma intenção e força o merchant a criar um checkout assinado.

O runtime de browser nunca recebe:

- `YUNO_PRIVATE_SECRET_KEY`, `vaulted_token` ou `credential_id` resolvível;
- `SignerPort`, chave privada do usuário/Bound ou escrita direta no banco;
- `YunoPaymentPort` ou uma tool `pay()`;
- autoridade para transformar conteúdo de página em política aprovada.

Texto, DOM e instruções encontrados na web são dados não confiáveis. O adapter aplica schema estrito, allowlist de domínios da demo, limite de passos/tempo, limpeza explícita da sessão e registra URL + evidência da oferta. O checkout assinado pelo merchant, e não o conteúdo lido pelo browser, é o objeto autoritativo usado pelo Verify.

Browserbase/Stagehand é a alternativa primária se o Firecrawl não oferecer estabilidade suficiente no site escolhido. Ele possui automação interativa e live view comparáveis, mas não integraremos os dois no MVP. Parallel permanece uma boa alternativa de Search/Extract/Task quando a prioridade for pesquisa com provenance; não é escolhido para o P2 porque a demo pede navegação visível.

### Integração Yuno e Agent Toolkit

O Agent Toolkit da Yuno valida que a plataforma oferece tools para agentes e adapters TypeScript, mas expô-lo diretamente ao TravelBot criaria uma rota de pagamento fora do gate. No MVP, apenas o módulo server-side `Yuno Adapter` possui as credenciais Yuno e chama Payments após receber um `authorization_id` reservado. Se o toolkit for usado por conveniência, ele ficará dentro desse módulo, com action filtering e sem acesso pelo loop do shopping agent.

### Função determinística

O núcleo será uma função sem I/O:

```ts
evaluate({
  agent,
  mandate,
  checkout,
  now,
  usage,
  nonceStatus,
}): Decision
```

Todos os dados são carregados e normalizados antes da chamada. As regras rodam em ordem estável e retornam códigos explícitos, por exemplo `invalid_agent_signature`, `mandate_revoked`, `checkout_integrity_failure`, `aggregate_limit_exceeded` e `replay_detected`. Uma regra inválida, ausente ou desconhecida resulta em `DENY`, nunca em coerção permissiva.

### Concorrência, replay e idempotência

- `nonce` terá restrição única por agente ou por mandato, conforme o envelope AP2 adotado.
- A linha do mandato será bloqueada durante a criação da reserva (`SELECT … FOR UPDATE`) ou atualizada com compare-and-swap equivalente.
- O checkout terá hash canônico; qualquer alteração depois da assinatura invalida a requisição.
- Uma autorização só pode fazer uma transição de pagamento válida por vez.
- A chamada Yuno usa `authorization_id` como chave de idempotência em todas as tentativas.
- Nenhuma transação de banco permanece aberta enquanto a chamada externa à Yuno está em andamento.
- Timeout de Yuno é estado desconhecido, não falha: o sistema mantém `PAYMENT_PENDING` até retry/reconciliação com a mesma chave.

### Credenciais e chaves

O banco guarda `credential_id` e o mapeamento protegido para o token Yuno. A API pública, os logs e os receipts usam apenas a referência lógica e dados mascarados. O adaptador Yuno é o único módulo que pode resolver o token.

No hackathon, segredos podem ser injetados pelo ambiente e protegidos pelo secret store da plataforma. Para produção, o mapeamento deverá ser criptografado por envelope encryption e as chaves de assinatura movidas para KMS/HSM. O MVP não será apresentado como uma implementação PCI completa.

### Auditoria

`AuditEvent` será append-only e terá payload canônico, `previous_hash` e `event_hash`. O encadeamento será por transação/autorização, evitando um lock global. Isso detecta alteração posterior dentro da cadeia, mas não impede que um operador com acesso total reescreva banco e hashes; produção exigirá exportação periódica para armazenamento imutável ou assinatura externa.

## Modelo de estado adicional

O modelo do PRD será estendido de forma mínima:

```text
Authorization.status = RESERVED | PAYMENT_PENDING | CONSUMED | FAILED | CANCELLED
Authorization.reserved_amount
Authorization.expires_at
Authorization.yuno_idempotency_key

Mandate.reserved_uses
Mandate.reserved_spend
```

Como alternativa, os campos reservados do mandato podem ser derivados por consulta às autorizações ativas. Para o MVP, materializá-los na mesma transação simplifica a demonstração e torna os invariantes explícitos.

## APIs e contratos

- Todos os endpoints mutáveis aceitam `Idempotency-Key`.
- `POST /verify` devolve `decision`, `authorization_id` somente quando reservado, `reasons[]`, `policy_version` e `evidence_hash`.
- `POST /authorizations/:id/pay` exige que a autorização pertença ao mesmo merchant/checkout verificado.
- Datas são UTC e serializadas em RFC 3339; valores monetários são inteiros na menor unidade e sempre carregam moeda.
- Payloads assinados usam serialização canônica definida e versionada; nunca se assina JSON arbitrário dependente da ordem de propriedades.
- Logs estruturados carregam IDs e hashes, nunca tokens ou dados brutos de cartão.

## Alternativas consideradas

### Microserviços e event streaming desde o início

Rejeitado para o MVP. Identity, Verify, Ledger e Payments separados introduziriam consistência distribuída no ponto exato em que revogação, replay e limites precisam ser atômicos. A modularidade interna preserva uma rota de extração posterior.

### Funções serverless independentes por endpoint

Não escolhida como arquitetura principal. É viável com PostgreSQL externo, mas aumenta cold start, observabilidade e coordenação de concorrência na demo sem melhorar o domínio. O monólito ainda pode ser hospedado em plataforma serverless que suporte o processo/API como unidade.

### Avaliação por LLM ou score probabilístico

Rejeitada. Não oferece repetibilidade, códigos de razão estáveis nem comportamento fail-closed. LLM fica limitado à proposta de política antes do consentimento humano.

### Manter uma transação SQL aberta durante a chamada Yuno

Rejeitada. Locks longos e resultado externo incerto prejudicam disponibilidade. A reserva transacional seguida de execução idempotente separa decisão, exclusão mútua e efeito externo.

### Consumir definitivamente no momento do `ALLOW`

Não escolhido. É seguro contra replay, mas pode gastar o mandato quando Yuno falha de forma terminal. A reserva mantém segurança e permite liberar capacidade após falha confirmada.

### Blockchain para auditoria

Rejeitada. Uma cadeia de hashes append-only atende a narrativa e os testes do MVP com muito menos complexidade. Imutabilidade externa pode ser adicionada posteriormente.

### Parallel/Exa como dependency principal de discovery

Não escolhida para o P2. Search e extraction são úteis, mas não produzem sozinhos o browser ao vivo que cria o WOW visual. Podem entrar depois, por trás do mesmo `DiscoveryPort`, se qualidade de busca ou provenance superar a necessidade de interação.

### Browserbase/Stagehand como runtime principal

Mantida como fallback técnico. É a referência mais especializada para browser agents, observabilidade e sessões reproduzíveis. Firecrawl foi escolhido primeiro porque reúne Search/Scrape/Interact e live view numa integração curta; a troca não altera Bound, AP2, merchant checkout ou Yuno.

## Consequências

### Positivas

- Revogação e limites são checados contra uma única fonte consistente.
- Casos concorrentes, split payment e replay têm invariantes testáveis.
- O caminho crítico é simples o bastante para instrumentar e demonstrar.
- O browser ao vivo aumenta o impacto da demo sem virar requisito para pagamento.
- AP2 e Yuno ficam atrás de portas substituíveis, evitando acoplamento do domínio a payloads externos.
- O ledger e os códigos de decisão tornam cada pagamento explicável.

### Negativas e riscos

- O processo da API é um domínio de falha único no MVP.
- PostgreSQL vira dependência crítica e exige migrations/backup.
- Reservas abandonadas e pagamentos de estado desconhecido exigem reconciliação.
- A chave local e o hash chain do hackathon não têm a força de KMS/HSM e armazenamento WORM.
- A implementação AP2 pode ser apenas do subconjunto necessário ao vertical; não deve ser vendida como conformidade completa sem testes oficiais.
- Sites reais podem mudar, bloquear automação ou injetar instruções; por isso o P0 não depende deles.

## Critérios de aceitação

1. Dois `POST /verify` concorrentes para um mandato de uso único produzem no máximo uma autorização `RESERVED`.
2. Repetir nonce, autorização ou idempotency key não gera nova cobrança.
3. Revogar e depois verificar produz `DENY mandate_revoked` na próxima leitura confirmada, com meta de menos de um segundo no ambiente da demo.
4. Checkout alterado após assinatura produz `DENY checkout_integrity_failure`.
5. Chave diferente da registrada para o agente produz `DENY invalid_agent_signature`.
6. Tentativas divididas respeitam reservas mais consumo consolidado.
7. Nenhum log, response ou evento contém PAN, CVV ou `vaulted_token`.
8. Toda transição de autorização e pagamento possui evento auditável com cadeia de hash válida.
9. Timeout de Yuno não libera a reserva nem cria retry com nova chave.
10. Todos os casos A–H da matriz do PRD passam de forma determinística.
11. Conteúdo malicioso de uma página não consegue chamar Yuno, alterar mandato ou assinar checkout.
12. A demo completa continua executável com o adapter VuelaYa quando Firecrawl está indisponível.

## Prioridade de entrega

| Prioridade | Entrega | Critério de corte |
|---|---|---|
| P0 | AP2 → Verify → revogação → Yuno → receipt, usando VuelaYa mock | Obrigatório e independente da web externa |
| P1 | Agent Passport, HITL e matriz adversarial | Depois de todos os invariantes P0 passarem |
| P2 | TravelBot escolhendo oferta do merchant mock | Agente real, ambiente controlado |
| P2 WOW | Firecrawl Interact + live view, atrás do `DiscoveryPort` | Só entra sem fragilizar o ensaio P0 |
| P3 | Parallel/Exa para busca mais ampla e provenance | Opcional |
| P4 | Checkout em sites humanos arbitrários | Fora do hackathon |

## Empresas e padrões de referência

| Referência | O que adotamos como inspiração | O que não significa |
|---|---|---|
| [Google / FIDO AP2](https://github.com/google-agentic-commerce/AP2) | Trusted Surface, mandates, binding checkout/payment e receipts | Implementar todo o ecossistema AP2 no hackathon |
| [Yuno](https://docs.y.uno/docs/ai-capabilities/agent-toolkit) | Vault, Payments, orquestração e adapter server-side pós-`ALLOW` | Dar tools de pagamento diretamente ao TravelBot |
| [Firecrawl](https://docs.firecrawl.dev/features/interact) | Search/Scrape/Interact, Playwright e live view do P2 | Torná-lo parte da autorização |
| [Browserbase / Stagehand](https://docs.browserbase.com/use-cases/agents) | Benchmark/fallback para browser agents observáveis | Integrar dois runtimes no MVP |
| [Trulioo KYA](https://www.trulioo.com/solutions/agentic) | Agent Passport, status contínuo, operador e provenance do agente | Fazer KYC/KYB completo no hackathon |
| [Visa Trusted Agent Protocol](https://developer.visa.com/capabilities/trusted-agent-protocol/trusted-agent-protocol-specifications) | Assinatura HTTP, binding de contexto, nonce e proteção contra replay | Alegar certificação Visa |
| [Experian Agent Trust](https://www.experian.com/business/products/agent-trust) | Human-to-agent binding e união de identidade, intenção e risco | Colocar score probabilístico no `ALLOW` determinístico |
| [Crossmint Agentic Cards](https://www.crossmint.com/products/agentic-cards) | UX de limites, revogação e credencial isolada | Substituir Yuno no MVP |
| [Stripe Shared Payment Tokens](https://stripe.com/blog/introducing-our-agentic-commerce-solutions) | Tokens escopados, expiráveis e sem exposição da credencial | Adotar ACP/Stripe no caminho principal |
| [Mastercard Verifiable Intent](https://www.mastercard.com/europe/en/news-and-trends/stories/2026/verifiable-intent.html) | Evidência criptográfica da intenção e alinhamento com AP2 | Depender da rede para a demo |

## Plano de evolução

Extrair serviços somente quando houver necessidade operacional comprovada. A primeira candidata é a reconciliação Yuno, executada por worker/outbox. Identity e Verify devem permanecer juntos enquanto a decisão depender de leitura transacional de mandato, revogação, nonce e uso. Em produção, adicionar KMS/HSM, secret manager, rate limiting, storage imutável de auditoria, webhook assinado da Yuno e política formal de retenção.

## Referência visual

O caminho aprovado e as fronteiras de confiança estão em [`../diagrams/bound-technical-architecture.html`](../diagrams/bound-technical-architecture.html).
