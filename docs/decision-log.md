# Decision log do Jaguary

| Metadado | Valor |
| --- | --- |
| Status | Registro histórico do projeto até o estado atual |
| Período coberto | 2026-08-29 a 2026-08-30 |
| Última revisão | 2026-08-30 |
| Escopo | Produto, arquitetura, segurança, integrações, experiência e operação |

## Objetivo deste documento

Este log registra como o Jaguary evoluiu, quais decisões orientaram a implementação, o que foi descoberto durante o trabalho e quais melhorias ou correções nasceram dessas descobertas.

Ele não substitui:

- os [ADRs](adr/), que explicam decisões arquiteturais duráveis em profundidade;
- a [documentação técnica](technical/README.md), que descreve o comportamento atual do código;
- o registro de [lacunas conhecidas](technical/known-gaps.md), que prioriza o que ainda falta para produção;
- os planos de implementação e spikes, que registram intenção ou investigação, mas não garantem comportamento entregue.

O histórico abaixo foi reconstruído a partir do Git, do código, dos testes, das migrações e da documentação existente. Quando a intenção inicial e o comportamento final diferem, este documento privilegia o que ficou implementado e registra a mudança de direção.

## Resumo da evolução

O projeto começou com uma pergunta simples: **como permitir que um agente faça uma compra sem transformar o LLM na autoridade sobre o dinheiro?** A resposta virou o princípio central do Jaguary:

```text
HUMANO → MANDATO → AGENTE → CHECKOUT → BOUND VERIFY → PAGAMENTO → RECIBO
```

A partir daí, o trabalho evoluiu em cinco movimentos:

1. separar interpretação probabilística de decisão econômica determinística;
2. construir uma espinha transacional para identidade, mandato, autorização, pagamento e auditoria;
3. conectar a espinha a uma experiência real de conversa e busca de voos;
4. adicionar autenticação, confiança externa, consentimento biométrico e autonomia durável;
5. corrigir o modelo de identidade para distinguir a plataforma que opera o TravelBot do cliente que delega uma compra.

## Linha do tempo de decisões, descobertas e melhorias

### 1. Definição do problema e da fronteira de autoridade

**Quando:** 2026-08-29  
**Commits principais:** `c4a0825`, `47c3316`

**Contexto.** O produto precisava responder de forma verificável se um agente, agindo por uma pessoa, podia executar uma compra exata naquele momento. O risco inicial era misturar interpretação de intenção, checkout, autorização e pagamento em uma única automação.

**Decisão.** O Bound seria o ponto exclusivo de decisão econômica. O LLM poderia interpretar linguagem e propor ações, mas não poderia criar `ALLOW`, movimentar dinheiro, definir preço, escolher credenciais ou alterar autoridade.

**Descobertas.** Commerce, prova de autoridade, enforcement e pagamento são problemas diferentes. UCP não substitui AP2; AP2 não substitui checkout; Yuno não substitui autorização; e nenhuma dessas camadas deveria virar o modelo interno inteiro do produto.

**Resultado.** Foi definida uma arquitetura multiprotocolo com contratos normalizados e um monólito modular transacional, descritos no [ADR-001](adr/ADR-001-bound-mvp-architecture.md) e no [ADR-002](adr/ADR-002-commerce-protocol-layering.md).

---

### 2. Escolha de uma arquitetura simples, transacional e explicável

**Quando:** 2026-08-29  
**Commits principais:** `61f4896`, `2ad2400`, `461fb8a`

**Decisão.** O repositório foi organizado como workspace `pnpm` com dois deployables — Next.js no frontend e Fastify no backend — e PostgreSQL como fonte de verdade.

**Por que.** Revogação, nonce, replay, limite agregado, reserva e consumo precisam concordar dentro da mesma fronteira transacional. Separar esses módulos em serviços distribuídos no MVP aumentaria a superfície de falha sem gerar valor proporcional.

**Melhorias incorporadas desde o início.** Foram adicionados health check, configuração por ambiente, lint, TypeScript, estrutura de testes e direções visuais. A identidade visual escolheu papel quente, tinta escura e azul cobalto para comunicar confiança sem parecer um dashboard financeiro genérico.

**Resultado.** A arquitetura permaneceu um monólito modular, com integrações externas escondidas atrás de portas estreitas. Essa escolha continua sendo a base do sistema atual.

---

### 3. Contratos antes das implementações

**Quando:** 2026-08-29  
**Commit principal:** `b753d30`

**Decisão.** Congelar primeiro os contratos v1 de commerce, identidade, mandatos, autorização, pagamentos, recibos, erros e convenções HTTP.

**Descoberta.** Sem contratos explícitos, valores sensíveis ou não autoritativos poderiam atravessar camadas por conveniência. A canonicalização também precisava ser definida cedo para que hashes e assinaturas fossem reproduzíveis.

**Melhorias.** Foram adotados schemas Zod, fixtures determinísticas, IDs de correlação, idempotency keys, respostas de erro padronizadas e testes de contrato. A coleção Postman passou a ser validada por teste para reduzir divergência entre API e documentação (`620cff2`).

**Resultado.** Os adapters externos podem mudar sem alterar o núcleo de política, e entradas desconhecidas falham antes de chegar ao caminho econômico.

---

### 4. Merchant controlado e termos econômicos autoritativos

**Quando:** 2026-08-29  
**Commit principal:** `7956ede`

**Decisão.** Criar o merchant de demonstração VuelaYa com catálogo determinístico, descoberta de capabilities e checkout assinado.

**Descoberta.** O preço não pode vir da conversa, do browser ou do modelo. O merchant precisa ser a fonte dos itens, quantidade, moeda, total, expiração e fulfillment.

**Melhoria.** O checkout passou a gerar um hash canônico e uma assinatura verificável. O Bound compara a proposta recebida com o checkout autoritativo, evitando que uma alteração de preço ou escopo seja tratada como a mesma compra.

**Limite consciente.** O caminho implementa um subconjunto normalizado inspirado em UCP; ainda não deve ser apresentado como interoperabilidade UCP completa.

---

### 5. PostgreSQL como fonte de verdade e harness transacional

**Quando:** 2026-08-29  
**Commit principal:** `a8de39c`

**Decisão.** Persistir o estado econômico e de auditoria em PostgreSQL usando Drizzle, com migrações versionadas e um banco separado para testes de integração.

**Descoberta.** Testes unitários da policy não provam segurança contra concorrência. Replay, double spend, consumo de limite e transições de pagamento precisam ser exercitados contra transações reais.

**Melhorias.** Foram adicionados Docker Compose, migrações, transaction harness, CI e testes de integração. O banco cresceu depois para sustentar autenticação, confiança, conversas, interrupções de aprovação, watches e recibos.

**Resultado.** PostgreSQL virou a espinha de autoridade do projeto, não apenas um armazenamento de aplicação.

---

### 6. Mandatos imutáveis, identidade criptográfica e Verify puro

**Quando:** 2026-08-29  
**Commits principais:** `5bc39bb`, `eaedeca`, `b56db7f`

**Decisões.**

- Mandatos ativos são assinados, delimitados por escopo, valor, moeda, merchant, validade e número de usos.
- Alterar uma condição econômica exige um novo mandato; autoridade já assinada não é editada.
- Cada requisição financeira precisa provar posse da chave registrada pelo agente.
- O Bound Verify executa regras puras e ordenadas e retorna apenas `ALLOW`, `ESCALATE` ou `DENY`.

**Descobertas.** Identidade declarada não é identidade provada. Ao mesmo tempo, posse de uma chave registrada não equivale a certificação externa do operador ou do build. Essa distinção originou o [ADR-003](adr/ADR-003-agent-identity-assurance.md).

**Melhorias.** Assinatura, `key_id`, algoritmo, build fingerprint, método, rota, corpo, timestamp e nonce passaram a ser vinculados. Agentes suspensos ou revogados falham fechados. Verify não faz chamadas a LLM, provider de identidade ou pagamento.

**Resultado.** A decisão econômica tornou-se reproduzível e independente das integrações probabilísticas ou externas.

---

### 7. Reserva atômica e proteção contra replay

**Quando:** 2026-08-29  
**Commit principal:** `24ff6ba`

**Decisão.** Um `ALLOW` só pode gerar efeito econômico quando a mesma transação registra o nonce e cria uma autorização `RESERVED`.

**Descoberta.** Verificar primeiro e reservar depois abre uma corrida: duas requisições podem observar o mesmo saldo de autoridade e ambas serem aprovadas.

**Melhorias.** Limites passaram a considerar reservas e pagamentos pendentes, não apenas compras concluídas. Nonces, revogação e snapshot de identidade são relidos e travados durante a reserva.

**Resultado.** A policy continua pura, enquanto o store transforma uma decisão válida em uma capacidade de uso único protegida por transação.

---

### 8. Pagamento durável, idempotência e auditoria encadeada

**Quando:** 2026-08-29  
**Commits principais:** `d76c291`, `12ccfc5`, `0d77e6f`, `fe24a75`

**Decisão.** Isolar pagamento atrás de `PaymentExecutor` e manter uma máquina de estados durável. Chamadas ao provider acontecem fora da transação; a aplicação faz transições curtas antes e depois da chamada.

**Descoberta.** Timeout não é falha e também não é sucesso. Repetir uma cobrança com outra chave depois de uma resposta ambígua pode duplicar o pagamento.

**Melhorias.**

- `authorization_id` virou a identidade estável de idempotência;
- respostas `UNKNOWN` e `TIMEOUT` permanecem `PAYMENT_PENDING` até reconciliação;
- sucesso consome a autorização e produz order/receipt de forma correlacionada;
- falha terminal libera a reserva;
- eventos de negócio são escritos em um ledger append-only encadeado por hash.

**Limite consciente.** O ledger é evidência local contra adulteração acidental ou não detectada; não é blockchain nem prova externa de imutabilidade.

---

### 9. Yuno: adapter real, fallback determinístico e honestidade de escopo

**Quando:** 2026-08-29  
**Commits principais:** `099e179`, `3de1f96`

**Investigação.** O sandbox e o modelo de credenciais da Yuno foram avaliados antes de tornar a integração um requisito de execução.

**Descobertas.**

- Uma credencial vaulted na Yuno não é um cartão universal para qualquer checkout externo.
- Sandbox, onboarding comercial e acesso a produtos de rede são coisas diferentes.
- Uma compra controlada em VuelaYa não deve ser apresentada como compra real em merchant arbitrário.
- PAN, CVV e tokens reutilizáveis nunca devem chegar ao TravelBot ou aos contratos públicos.

**Decisão.** Implementar e testar o `YunoPaymentExecutor`, mas manter um executor fake determinístico como fallback explícito de demo. O cadastro de credencial deve ocorrer apenas em superfície segura do provider. O raciocínio completo está no [ADR-004](adr/ADR-004-credential-enrollment-and-external-checkout.md).

**Pendência descoberta depois.** A configuração Yuno ainda não é conectada pelo composition root atual; portanto, habilitar variáveis da Yuno não troca automaticamente o executor fake. Isso permanece uma lacuna de alta severidade, não uma integração concluída.

---

### 10. Trusted Surface e evolução da experiência de chat

**Quando:** 2026-08-29  
**Commits principais:** `3935361`, `e7889f7`, `a7391e5`, `fc1d99d`

**Decisão de produto.** A autoridade precisava ser visível e compreensível. A interface não deveria esconder mandato, limites, confirmação ou evidência atrás de uma experiência de chat “mágica”.

**Melhorias.** Foram criados a Trusted Surface, componentes de conversa e confirmação, landing page, navegação de conta, páginas de compras, métodos de pagamento e merchant. O workspace de chat foi refinado para reduzir ruído, melhorar hierarquia, loading, scroll e continuidade.

**Descoberta.** Confiança não é apenas uma propriedade do backend. O usuário precisa conseguir distinguir proposta, aprovação, execução, bloqueio e recibo pela interface.

**Resultado.** O frontend passou de scaffold para uma narrativa completa de autoridade, mantendo o azul como trilho de ação autorizada e superfícies de papel para evidência e revisão.

---

### 11. TravelBot com OpenAI, mas estado sob controle da aplicação

**Quando:** 2026-08-29  
**Commit principal:** `d1e8e5c`

**Decisão.** Usar OpenAI Agents SDK atrás de uma porta própria, com saída estruturada, tools estritas, chamadas paralelas desabilitadas e persistência da conversa no PostgreSQL.

**Descobertas.**

- Saída estruturada reduz ambiguidade, mas continua sendo entrada não confiável.
- Uma interrupção `needsApproval` do SDK não é consentimento humano suficiente.
- IDs do provider servem para correlação, não como fonte de verdade do workflow.
- Reconectar uma stream não pode repetir efeitos já confirmados.

**Melhorias.** A aplicação passou a controlar uma máquina de estados própria, recalcular tools legais a cada turno, persistir eventos SSE reproduzíveis e criptografar interrupções de aprovação com binding exato a merchant, checkout hash, valor, moeda e mandato. O modelo não escolhe idempotency key nem chama o executor de pagamento.

**Resultado.** O OpenAI runtime interpreta e propõe; o `TravelBotService` valida e comita. A decisão está formalizada no [ADR-005](adr/ADR-005-travelbot-agents-runtime.md).

---

### 12. Chat contextual, inglês, busca real e aprovação simplificada

**Quando:** 2026-08-29  
**Commits principais:** `3659ea4`, `3bd26bc`, `a6e5fab`, `bff6bb7`, `b6d9e9b`, `01db31d`

**Melhorias de produto.**

- O chat passou a recomputar campos faltantes e responder ao contexto da viagem.
- A experiência pública foi traduzida para inglês.
- A busca de voos passou a usar Google Flights via SerpApi, com validação, normalização, deduplicação e cache curto.
- A aplicação passou a escolher deterministicamente a melhor oferta compatível: menor total, depois saída mais cedo, depois ID estável.
- A seleção intermediária de oferta saiu do fluxo normal; o usuário confirma diretamente a compra exata, com detalhes e fonte oficial.
- Conversas e recibos foram preservados na navegação da conta.

**Descoberta.** Mais etapas de confirmação não significam mais segurança. A confirmação correta é uma etapa única, explícita e vinculada aos termos exatos; telas redundantes só aumentavam atrito.

**Limites descobertos.** A busca ainda trata preços para múltiplos passageiros como multiplicação de uma cotação de um adulto, e timestamps locais ainda precisam de semântica de fuso mais forte.

---

### 13. Login, confiança externa, Agent Passport e consentimento biométrico

**Quando:** 2026-08-30  
**Commits principais:** `c3fca32`, `f7eda24`

**Decisões.**

- Adicionar sessão de principal com provider demo e Google OIDC.
- Integrar Didit por uma porta neutra de fornecedor.
- Tratar a resposta externa como evidência normalizada, nunca como `ALLOW`.
- Emitir Agent Passport ES256 de curta duração com referências opacas e binding de agente, principal, chave e build.
- Exigir consentimento biométrico antes da ativação de mandato quando a política configurada exigir confiança externa.

**Descoberta.** Autenticar a pessoa, atestar o operador/agente e consentir com uma compra são atos diferentes. Nenhum deles substitui os demais.

**Melhorias.** O sistema passou a falhar fechado quando `EXTERNAL_REQUIRED` não possui atestação válida, evitar persistência de payload bruto/PII do provider e vincular a evidência biométrica ao mandato e ao cliente corretos.

---

### 14. Primeiro deploy e correções de portabilidade de build

**Quando:** 2026-08-30  
**Commits principais:** `2c7d9f8`, `eff5913`, `e8c037d`, `928b085`

**Decisão.** Preparar frontend e backend para Vercel, com PostgreSQL Neon, mantendo instruções de deploy separadas da execução local.

**Descobertas.** O build de produção revelou dependências implícitas nos tipos globais de `fetch` e diferenças entre o ambiente Node local e a plataforma de deploy.

**Melhorias.** O composition root foi separado do entry point, o contrato de fetch do provider de voos foi isolado e os tipos de plataforma web foram incluídos explicitamente no backend.

**Resultado.** O deploy deixou de depender acidentalmente do contexto de testes/desenvolvimento e ganhou documentação operacional própria.

---

### 15. Workspace integrado, sessões e conversas personalizadas

**Quando:** 2026-08-30  
**Commits principais:** `9604152`, `a735244`, `541dae0`

**Melhorias.** As superfícies antes isoladas foram integradas ao workspace Jaguary: dashboard, agentes, merchants, oportunidades, pagamentos, compras e auditoria. A conversa ganhou título, listagem, exclusão e continuidade por usuário. A landing passou a refletir corretamente a sessão ativa.

**Descoberta.** Persistir a conversa não basta; toda leitura e mutação pública também precisa ser owner-scoped. O backend passou a derivar o cliente da sessão opaca em vez de aceitar `principal_id` escrito pelo browser.

**Resultado.** A personalização deixou de ser apenas visual e passou a ter isolamento de dados no contrato da API de conversa.

---

### 16. Monitoramento autônomo de tarifas com autoridade antecipada

**Quando:** 2026-08-30  
**Commit principal:** `b7b130e`

**Problema.** Uma busca síncrona terminava sem resultado quando não havia voo dentro do orçamento. Pedir aprovação apenas quando uma oferta futura surgisse impediria uma compra realmente autônoma.

**Decisão.** Criar um travel watch durável. O cliente aprova previamente um mandato condicional de uso único, limitado por rota, janela, cabine, passageiros, merchant, moeda e orçamento máximo. A ativação exige liveness; a compra futura não pede uma nova biometria, mas passa novamente pelo Verify completo.

**Descobertas.**

- Timers em memória e requests HTTP longos não servem para autonomia confiável.
- Aumentar orçamento autonomamente seria ampliar autoridade sem consentimento.
- Uma oferta acima do orçamento é diagnóstico, não permissão para comprar.

**Melhorias.** Watches e tentativas foram persistidos; workers usam lease recuperável e `FOR UPDATE SKIP LOCKED`; checkout, Verify e pagamento recebem identidades idempotentes estáveis; falhas temporárias usam backoff; cancelamento revoga o mandato.

**Resultado.** Reinícios podem retomar monitoramento sem recriar autoridade ou duplicar compra. A decisão está no [ADR-006](adr/ADR-006-durable-autonomous-travel-watch.md).

---

### 17. Refinos finais de confiança, compra, voz e dados reais

**Quando:** 2026-08-30  
**Commits principais:** `96de5e1`, `6fdaa34`, `5ee6e9c`, `2d74097`

**Melhorias.**

- Verificações de identidade pendentes passaram a poder ser reiniciadas.
- Quick replies de viagem ficaram contextuais e testadas.
- A página de compras passou a exibir recibos e detalhes reais.
- O chat recebeu voz em tempo real com token efêmero emitido pelo backend.
- Mocks do workspace foram substituídos por dados das APIs de agentes, merchants, pagamentos, compras, auditoria e oportunidades.

**Descoberta.** Mocks que sobrevivem depois da integração escondem falhas de ownership, loading, estado vazio e divergência de contrato. A UI precisa refletir o mesmo estado durável que governa a compra.

**Resultado.** O frontend tornou-se um consumidor real do sistema, e não apenas uma demonstração visual paralela.

---

### 18. Correção crítica: operador da plataforma não é o cliente

**Quando:** 2026-08-30  
**Commits principais:** `b73f9fa`, `e145864`

**Problema descoberto.** O TravelBot havia sido registrado como se Marta fosse sua proprietária e a evidência Didit dela era reutilizada como referência biométrica. Isso funcionava para a fixture de Marta, mas bloqueava outros clientes e criava o risco de comparar a biometria de uma pessoa com a de outra.

**Correção.** Separar duas identidades:

- `principal_jaguary_platform` opera o agente público `agent_travelbot` e sua chave/build;
- o cliente autenticado possui sua sessão, conversa, atestação Didit, mandato, consentimento, credencial lógica, autorização e recibo.

**Melhorias.** O TravelBot passou a ter `access_scope=PUBLIC`; confiança externa passou a ser consultada por `(agent_id, principal_id)`; credenciais lógicas são isoladas por cliente; o snapshot do agente usa confiança criptográfica da plataforma, enquanto a autoridade econômica usa a evidência do cliente configurada pela policy.

**Aprendizado.** “Principal do agente” e “pessoa em nome de quem ele compra” não são sinônimos em um agente de plataforma multiusuário. Esse vínculo precisa ser explícito no banco, nas rotas, na biometria e no Verify.

**Resultado.** Um TravelBot público pode atender vários clientes sem compartilhar conversa, confiança, credencial ou autoridade. A correção está formalizada no [ADR-007](adr/ADR-007-agent-operator-and-customer-authority.md).

## Decisões que permaneceram invariantes

Ao longo das mudanças de UX e integrações, estes princípios não mudaram:

1. O modelo propõe; código determinístico decide e comita.
2. O merchant é autor dos termos econômicos; o browser e o agente não são.
3. Somente `ALLOW` reservado transacionalmente pode alcançar pagamento.
4. Mandatos ativos são imutáveis, limitados, revogáveis e protegidos contra replay.
5. Credenciais reutilizáveis e segredos ficam fora do browser, do LLM, dos logs e dos contratos públicos.
6. Integrações externas são normalizadas antes de entrar na policy.
7. Chamadas externas não acontecem dentro de transações SQL.
8. Resposta econômica ambígua permanece pendente até reconciliação; não é convertida em sucesso ou falha por conveniência.
9. Toda autoridade pertence a um cliente autenticado, mesmo quando o agente é público e operado pela plataforma.
10. A documentação deve diferenciar implementação real, subconjunto normalizado, sandbox, spike e trabalho planejado.

## Alternativas descartadas durante o projeto

| Alternativa | Motivo do descarte |
| --- | --- |
| Deixar o LLM autorizar ou pagar | Saída probabilística não pode ser a autoridade final sobre dinheiro. |
| Expor Yuno Agent Toolkit ou token ao TravelBot | Criaria um caminho que contorna Verify, mandato e isolamento de credencial. |
| Usar AP2 como protocolo completo de commerce | AP2 prova autoridade, mas não substitui catálogo, checkout, order e fulfillment. |
| Usar UCP como payment rail | UCP organiza commerce; execução e liquidação pertencem ao provider/rail. |
| Tratar Yuno Vault como cartão portátil | A referência é válida no contexto integrado; não é uma credencial universal para sites arbitrários. |
| Guardar PAN/CVV no Bound | Aumentaria o escopo PCI e exporia material reutilizável sem necessidade. |
| Fazer browser automation como caminho P0 | É frágil, sujeito a bloqueios e inadequado para receber credencial bruta. |
| Verificar e só depois reservar | Permite corrida e consumo concorrente da mesma autoridade. |
| Repetir pagamento após timeout com nova chave | Pode gerar cobrança duplicada. |
| Usar timer em memória para monitoramento | Reinícios e múltiplas instâncias perderiam ou duplicariam trabalho. |
| Aumentar orçamento do watch automaticamente | Ampliaria a autoridade sem novo consentimento. |
| Considerar `needsApproval` como consentimento | É um estado do runtime, não prova humana vinculada aos termos econômicos. |
| Tratar o cliente como proprietário do TravelBot | Confunde operador do agente com titular da autoridade e quebra o isolamento multiusuário. |

## Lacunas assumidas e descobertas ainda abertas

O projeto terminou este ciclo com um vertical funcional de referência, mas não como uma plataforma pronta para dinheiro real. As principais lacunas conhecidas são:

- rotas gerais de mandato e travel watch ainda não aplicam ownership de sessão de forma consistente;
- o composition root ainda instala o pagamento fake, mesmo quando a configuração Yuno existe;
- checkouts autoritativos e algumas chaves de assinatura são efêmeros e locais ao processo;
- as capabilities anunciadas de UCP/AP2 são mais amplas do que o wire protocol realmente implementado;
- pagamentos pendentes não possuem webhook ou worker de reconciliação conectado ao runtime;
- busca com múltiplos passageiros ainda deriva o total de uma cotação de um adulto;
- horários locais de voo ainda podem ser confundidos com instantes UTC;
- catálogos, offers, rate limiting e algumas chaves precisam de armazenamento/rotação compartilhados;
- alguns vínculos entre tabelas de workflow ainda são garantidos pela aplicação, não pelo banco.

Detalhes, impacto e ordem recomendada estão em [Known implementation gaps](technical/known-gaps.md).

## Como manter este log

Atualize este arquivo quando houver uma descoberta que mude entendimento, uma correção de premissa, uma melhoria transversal ou uma decisão importante que não justifique sozinha um novo ADR.

Para cada nova entrada, registre:

1. data e commits/PRs relacionados;
2. contexto ou problema observado;
3. decisão tomada;
4. descoberta ou hipótese corrigida;
5. consequência no produto, código, segurança ou operação;
6. limitações que continuaram abertas.

Crie um ADR separado quando a decisão for cara de reverter, afetar várias fronteiras do sistema ou precisar preservar alternativas e critérios de aceitação em profundidade.
