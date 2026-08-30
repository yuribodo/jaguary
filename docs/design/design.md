# Bound Trusted Surface — design system v0.2

Status: **direção aprovada para a primeira Trusted Surface**
Direção líder: **01 · Carta de Autoridade**

## Tese

A autorização criptográfica deve ser tão compreensível e durável quanto um documento assinado, sem imitar uma cédula ou um passaporte. A superfície é uma **conversa que produz uma carta de autoridade**: quente, editorial, precisa e verificável.

O usuário deve reconhecer, nesta ordem:

1. qual ação econômica está sendo delegada;
2. quem recebe a autoridade e para qual merchant;
3. quais limites, validade e escopo serão assinados;
4. se o mandato ainda é apenas `DRAFT`, está `ACTIVE` ou foi `REVOKED`;
5. qual evidência real a API devolveu.

## Princípios

- **Autoridade é o conteúdo principal.** Rota, agente, merchant, valor e validade têm mais peso que chrome de aplicação.
- **Evidência fica à vista.** IDs, hash, algoritmo, key ID e correlation ID aparecem em mono, com truncamento visual apenas quando necessário.
- **Estado não é decoração.** `DRAFT`, `ACTIVE` e `REVOKED` usam texto, forma e cor; nunca dependem somente de cor.
- **Nenhuma decisão é fabricada.** A policy pura BE-06 existe no backend, mas enquanto `POST /verify` e a reserva BE-07 não existirem, a área de decisão declara “não conectada” e não mostra `ALLOW` simulado.
- **A conversa não esconde o agente.** TravelBot fala em uma thread, mas sua identidade pública verificável, operador, build fingerprint e chave pública continuam acessíveis — sem mascote nem personalidade inventada.

## Direção de interação · chat-first

A entrada do produto é a intenção em linguagem natural. A conversa organiza o percurso; widgets embutidos tornam fatos comerciais e atos de autoridade inspecionáveis. Nesta versão não há LLM nem endpoint de chat: um orquestrador determinístico reconhece o pedido de demonstração e conduz as APIs existentes sem fingir inteligência ou decisão de autorização.

Sequência principal:

1. Marta descreve a viagem no composer ou usa a sugestão GRU → COR;
2. TravelBot consulta identidade, merchant e ofertas reais e seleciona automaticamente a opção mais bem ranqueada;
3. o checkout real fixa os termos comerciais e Marta revisa o voo escolhido junto da autorização;
4. TravelBot apresenta a carta de autoridade completa e solicita a criação do `DRAFT`;
5. um segundo gesto, separado e explícito, ativa o mandato;
6. o mandato ativo permanece na thread, com detalhes expansíveis e revogação confirmada.

### Anatomia da thread

- **Cabeçalho mínimo:** Bound, identidade do TravelBot, saúde da API e último correlation ID. Não é uma barra de dashboard.
- **Memória lateral:** no desktop, uma sidebar de 272 px guarda apenas a conversa atual e a identidade verificável do agente; no mobile, a mesma estrutura abre como drawer. Ela recolhe com `Ctrl/Cmd+B`, preserva foco visível e não inventa histórico persistente.
- **Mensagem humana:** alinhada à direita, curta e sem bolha colorida genérica.
- **Mensagem do agente:** nome, timestamp e texto editorial alinhados à esquerda.
- **Widget de voo selecionado:** resumo merchant-authored inspirado na hierarquia informacional do Flighty, integrado à revisão de autorização.
- **Widget de mandato:** documento inline com estados `PROPOSTA`, `DRAFT`, `ACTIVE` e `REVOKED`; ações anteriores ficam visualmente encerradas após a transição.
- **Atividade:** uma linha textual discreta durante requisições; sem cadeia de raciocínio, passos fictícios ou teatro de autonomia.
- **Composer:** textarea com crescimento automático, `Enter` envia e `Shift+Enter` cria linha; permanece disponível para recomeçar o fluxo.

### Referências estudadas e decisão

| Referência | Emprestar | Evitar nesta fase |
| --- | --- | --- |
| OpenAI Apps in ChatGPT | interfaces ricas surgindo no ponto certo da conversa | copiar o chrome visual do ChatGPT |
| OpenAI app permissions | aprovação separada para ações com consequência | consentimento genérico ou implícito |
| OpenAI Apps SDK · shopping cart | widget com estado que persiste após a ação | adicionar um runtime que o backend atual não oferece |
| Vercel AI Elements · Conversation | viewport rolável, auto-scroll e retorno ao fim | recursos de download que não pertencem ao P0 |
| Vercel AI Elements · Prompt Input | textarea responsiva e semântica Enter/Shift+Enter | anexos, modelos e menus sem função nesta entrega |
| Vercel AI Elements · Confirmation | estados request/accepted/rejected para human-in-the-loop | tratar ativação como um botão comum sem contexto |
| assistant-ui · Thread/Tool UI | acessibilidade e ferramenta inline na ordem da conversa | dependência de runtime e abstração prematura |
| OpenAI ChatKit advanced samples | oferta de viagem e ação server-handled dentro da thread | painel lateral de suporte e backend ChatKit |
| ChatGPT / Refero sidebar | histórico recente compacto, canvas principal flexível e chrome de baixo contraste | copiar a identidade acromática ou esconder estados de segurança que dependem de cor semântica |
| Claude conversation sidebar | “nova conversa”, recents e ação contextual por conversa | projetos, favoritos e organização que o P0 ainda não possui |
| shadcn Sidebar / 21st | primitive responsivo, colapso, drawer mobile, tooltip e atalho de teclado | menus genéricos de dashboard, team switcher, billing ou navegação aninhada |
| Layers · ChatGPT exploration | proporção, respiro e metadados quietos | device mockup e acabamento de portfólio sem função no produto |

Decisão implementada: usar **shadcn/base-nova** como sistema de componentes e **Vercel AI Elements** para Conversation, Message, PromptInput, Suggestion, Shimmer e Confirmation. Toda composição e responsividade da aplicação usa utilities Tailwind; o CSS global contém apenas imports, tokens do moodboard e base do tema. Oferta e mandato permanecem widgets de domínio próprios dentro da thread, compostos com shadcn e Tailwind e conectados apenas às APIs existentes do Bound.

A sidebar usa o primitive oficial do shadcn, mas sua arquitetura é de conversa, não de aplicação administrativa: `Nova conversa`, a sessão GRU → COR quando ela existe e o disclosure da identidade pública do TravelBot. Como não há endpoint de histórico nesta entrega, “Nenhuma outra conversa” é um estado honesto, não uma lista simulada.

## Linguagem visual

### Cores

| Papel | Token | Valor | Uso |
| --- | --- | --- | --- |
| Paper | `--paper` | `#F4F0E7` | fundo geral e matéria do documento |
| Paper raised | `--paper-raised` | `#FAF8F2` | carta, ticket e blocos de leitura |
| Ink | `--ink` | `#141511` | títulos, bordas fortes e ações primárias |
| Ink muted | `--muted` | `#5E6158` | corpo secundário e metadados |
| Cobalt | `--cobalt` | `#334DE8` | seleção, foco e continuidade da authority trace |
| Coral | `--coral` | `#F06B52` | revogação, erro e quebra da trace |
| Verify | `--verify` | `#A9B9A5` | autoridade válida e evidência conferida |
| Rule | `--rule` | `rgba(20,21,17,.16)` | divisórias, perfurações e grids |

Combinações de baixo contraste do moodboard são reservadas a textura decorativa. Texto funcional mantém contraste AA.

### Tipografia

- **Instrument Serif:** títulos editoriais, rota e declarações de autoridade.
- **Geist:** corpo, botões e leitura operacional.
- **Geist Mono:** rótulos, serial, IDs, timestamps, hashes e estados.

Hierarquia base:

- display: `clamp(3rem, 8vw, 7rem)`, serif, entrelinha curta;
- heading: `clamp(2rem, 4vw, 4rem)`, serif;
- body: `1rem / 1.6`, sans;
- label: `0.68rem`, mono, caixa alta, tracking amplo;
- evidence: `0.75rem`, mono, com quebra segura de palavras.

### Geometria e matéria

- Layout editorial assimétrico, com linhas longas, numeração de seção e margens generosas.
- Cartas e tickets usam cantos discretos (0–12 px), borda fina e sombra de papel; não usam vidro ou blur.
- Microtexto aparece apenas em metadados de evidência, sem competir com a conversa.
- Oferta e mandato usam containers familiares de tool UI: borda, cabeçalho com origem e estado, corpo escaneável e ação no rodapé.
- A distinção entre fato comercial e autoridade vem da hierarquia e da cópia, não de ornamentação documental.

## Assinatura: Authority Trace

`HUMANO → MANDATO → AGENTE → CHECKOUT → PAGAMENTO`

- A trace começa em ink, usa cobalt no trecho selecionado e termina em regra pontilhada quando o próximo estágio ainda não existe.
- Antes da integração HTTP e da reserva BE-07, pagamento permanece explicitamente indisponível; a interface não salta do checkout para `ALLOW`.
- Em revogação, o trecho posterior ao mandato é interrompido em coral.
- No mobile, a trace vira uma sequência vertical ou uma faixa horizontal rolável com rótulos sempre legíveis.

## Superfícies desta entrega

### 1. Voo selecionado e autorização

- Cabeçalho curto “Bound by Jaguary”, status real da API e última correlation ID.
- Rota GRU → COR é o display principal.
- O único voo escolhido pelo TravelBot contém rota, aeroportos, horários locais, duração, escalas, cabine, total e validade observados na API.
- Passaporte do TravelBot mostra estado, algoritmo, key ID e build fingerprint reais.

### 2. Revisão do mandato

- Conteúdo lê como uma carta: “Marta autoriza TravelBot a comprar…”.
- Escopo completo fica visível antes da criação.
- O checkout merchant-authored mostra hash e assinatura como evidência, sem insinuar autorização Bound.
- O primeiro ato cria `DRAFT`; um segundo ato, separado e explícito, ativa o mandato.

### 3. Detalhe e revogação

- Estado e validade dominam o topo.
- Termos assinados, prova e referência lógica de credencial são legíveis e copiáveis pelo navegador.
- Revogar exige confirmação inline e explica que a autoridade termina, não o agente.
- A área Bound Verify / BE-07 usa uma interface substituível e o estado `NOT_CONNECTED` nesta versão.

## Estados do produto

- **Loading:** skeletons preservam a composição do documento e usam `aria-live` com texto conciso.
- **Vazio:** informa que VuelaYa não publicou oferta GRU → COR e oferece nova consulta.
- **Erro de API:** mensagem pública, ação de retry e correlation ID quando presente.
- **API offline:** tratamento próprio, sem correlation ID inventada, com URL pública configurada visível.
- **Ação pendente:** botão desabilitado, verbo no gerúndio e `aria-busy` no agrupamento afetado.

## Interação, movimento e acesso

- Toda ação usa elementos `button` ou `a`, com foco cobalt visível e área mínima de 44 px.
- A ordem de tabulação segue a ordem visual e não depende de hover.
- Feedback assíncrono usa `aria-live="polite"`; erros usam `role="alert"`.
- O reveal da trace e o pouso do selo duram no máximo 420 ms e são removidos em `prefers-reduced-motion`.
- Conteúdo não depende de animação, textura, cor ou cursor para comunicar estado.

## Responsividade

- Desktop: grade 12 colunas; conteúdo principal 7–8 colunas e evidência 4–5.
- Tablet: duas colunas equilibradas; passport passa abaixo da oferta quando necessário.
- Mobile: coluna única; botões ocupam a largura; evidence strings quebram; tabelas viram pares rótulo/valor.
- Nenhum conteúdo funcional deve exigir rolagem horizontal. A única exceção permitida é a trace, que também possui descrição textual acessível.

## Anti-padrões

- dashboard genérico, sidebar administrativa ou mosaico de cards iguais;
- gradiente fintech, glassmorphism, neon, mascotização do agente;
- cartão de crédito literal, PAN, CVV, token Yuno ou affordance de pagamento;
- selo “verificado” sem prova real devolvida pela API;
- `POST /verify`, ferramenta `pay()` ou decisão `ALLOW` fictícia.
