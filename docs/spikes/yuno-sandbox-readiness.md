# Spike: readiness da integração Yuno sandbox

## Estado e decisão

- **Data da verificação:** 2026-08-29.
- **Escopo:** preparar a [BE-09](https://github.com/yuribodo/jaguary/issues/10) sem implementar o fluxo de pagamento de produção.
- **Decisão arquitetural relacionada:** [ADR-004 — Cadastro obrigatório de credencial e compra em checkout externo](../adr/ADR-004-credential-enrollment-and-external-checkout.md).
- **Execução realizada:** leitura de contratos e documentação, sem chamada autenticada, cadastro, tokenização ou pagamento no sandbox.
- **Readiness documental:** concluída.
- **Readiness operacional:** bloqueada até validar acesso, configuração da conta e elegibilidade do fluxo de cartão tokenizado com a Yuno.
- **Decisão temporária:** enquanto não houver conta Yuno, todo o desenvolvimento e demonstração usam exclusivamente o `FakePaymentExecutor`; o caminho live-sandbox permanece desabilitado.
- **Contrato v1:** `PaymentExecutor` e `PaymentResult` suportam o caminho estreito da BE-09 — cartão previamente enrolled, pagamento síncrono, single-step e sem desafio 3DS — sem alteração. Eles não representam sozinhos todo o ciclo assíncrono necessário em produção.
- **Fundação implementada sem rede:** ver [BE-09 — Fundação do adapter Yuno sandbox](../be-09-yuno-adapter.md). A issue continua operacionalmente bloqueada e o wiring permanece pendente da BE-10.

As conclusões sobre a Yuno abaixo usam somente documentação oficial atual da Yuno. Os links foram conferidos na data acima.

## Limites deste spike

Este documento não autoriza:

- criar cliente, sessão, enrollment ou pagamento no sandbox;
- usar credenciais de produção;
- copiar cartões de teste para código, logs ou fixtures;
- habilitar um fluxo `DIRECT` antes de confirmar com a Yuno o requisito de PCI/AOC para a conta;
- expor Yuno Agent Toolkit ao TravelBot;
- alterar os contratos em `backend/src/contracts/v1/`.

## Resultado de readiness

| Item | Resultado | Evidência ou ação pendente |
|---|---|---|
| Ambiente | Confirmado documentalmente | Sandbox usa `https://api-sandbox.y.uno`; Test Mode e Live Mode têm chaves diferentes. |
| Credenciais | Não validado nesta máquina | Obter chaves de Test Mode e fazer apenas uma consulta read-only antes de qualquer pagamento. |
| Conta e routing | Não validado | Confirmar `account_id`, Yuno Testing Gateway, rota de CARD publicada e Checkout Builder. |
| Fallback sem conta | Decidido | Usar somente `FakePaymentExecutor`, com resultados determinísticos e fixtures sanitizadas. |
| Enrollment seguro | Viável com SDK/Secure Fields | PAN/CVV seguem diretamente do browser para a Yuno; há um bloqueio adicional sobre o `vaulted_token` retornar ao callback do browser. |
| Pagamento server-side com `vaulted_token` | Documentado pela Yuno | O exemplo oficial usa `workflow: DIRECT`; confirmar habilitação e exigência de PCI/AOC mesmo sem PAN no servidor. |
| Idempotência | Compatível com adaptação | Yuno exige UUID e retém o resultado por 24 horas; o contrato local aceita, mas não exige, UUID. |
| Resultado síncrono | Compatível | `SUCCEEDED/APPROVED`, `DECLINED` e `REJECTED` podem ser normalizados. |
| Timeout ou assíncrono | Compatibilidade parcial | Pode retornar `TIMEOUT`/`UNKNOWN`, mas webhook e reconciliação precisam de serviço e persistência fora do port atual. |
| Brasil | Parcialmente confirmado | `BR`, `BRL`, duas casas e documentos locais estão documentados; requisitos finais dependem do provider/routing. |
| 3DS | Fora do happy path da BE-09 | Um challenge requer interação humana e não pode ser concluído pelo TravelBot. |

## 1. Obtenção e validação do acesso ao sandbox

A Yuno chama o sandbox de **Test Mode** no Dashboard. Sandbox e produção usam chaves diferentes, embora o login da organização seja o mesmo. O sandbox não movimenta dinheiro real e tem base URL própria. Ver [API Environments](https://docs.y.uno/reference/getting-started/api-environments) e [Developers (Credentials)](https://docs.y.uno/docs/using-yuno/settings/developers-credentials).

### Checklist de obtenção

1. Obter acesso à organização correta no [Yuno Dashboard](https://dashboard.y.uno/).
2. Ativar **Test Mode** antes de consultar qualquer identificador ou chave.
3. Selecionar a conta que representará VuelaYa/Bound no sandbox.
4. Obter, pelo secret manager e nunca por chat ou arquivo versionado, as chaves de Test Mode e o `account_id`.
5. Em **Connections**, conectar o **Yuno Testing Gateway**.
6. Em **Routing**, criar e publicar uma rota de `CARD` apontando para o gateway de teste.
7. Em **Checkout Builder**, habilitar `CARD` e publicar a configuração.
8. Configurar webhook v2 de pagamento com HMAC habilitado.

O gateway de teste é exclusivo do sandbox, aceita todos os países e moedas e não precisa de credenciais próprias de provider; as chamadas à API Yuno continuam exigindo as credenciais da conta. Ver [Yuno Testing Gateway](https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway) e [Set Up Payment Connection](https://docs.y.uno/docs/direct-integration-use-cases/set-up-payment-connection).

### Validação segura, sem criar pagamento

O operador autorizado deve:

1. conferir no Dashboard que está em Test Mode e que conta, conexão, routing e checkout estão publicados;
2. executar, a partir do backend e com redaction ligada, uma consulta `GET /v1/payments?merchant_order_id=...` para um pedido de sandbox já existente e conhecido;
3. aceitar `200` como autenticação válida; tratar `401` como chave inválida e `403` como chave sem permissão ou restrição de IP;
4. se ainda não houver um pagamento conhecido, validar apenas Dashboard e credenciais até existir autorização explícita para criar dados de teste — não criar um pagamento só como health check;
5. nunca imprimir request headers, response integral ou configuração do processo.

Uma allowlist de IP pode estar habilitada no Dashboard. O IP de saída do ambiente precisa ser autorizado sem desabilitar a proteção globalmente.

## 2. Identificadores e escopos

| Identificador | Necessidade | Origem e uso | Armazenamento recomendado |
|---|---|---|---|
| Organização Yuno | Contexto de acesso | Agrupa contas e pode ter chaves com acesso a todas elas. Não é campo obrigatório de `POST /v1/payments`. | Inventário operacional, fora do domínio de pagamento. |
| `account_id` | Obrigatório | UUID de 36 caracteres exibido no Dashboard; identifica a conta no enrollment e no pagamento. A documentação antiga também usa “account code”. | Configuração server-side. |
| Chaves de organização ou conta | Obrigatórias | A conta dá menor privilégio; usar chave account-scoped/customizada se o plano permitir. Test e Live são separadas. | Secret manager. |
| `merchant_id` do Bound | Obrigatório localmente | Identidade VuelaYa já vinculada à autorização. Não deve ser confundida com `account_id`. | Domínio Bound. |
| `merchant_order_id` | Obrigatório na Yuno | Referência idempotente do pedido, de 3 a 255 caracteres. Proposta: valor persistido derivado de `authorization_id` ou `checkout_id`, estável entre retries. | Tentativa de pagamento. |
| `merchant_reference` | Opcional na Yuno | Referência da transação definida pelo merchant. Pode carregar uma referência opaca do Bound. | Tentativa de pagamento. |
| Yuno customer `id` | Necessário para enrollment e reuso | Retornado por `POST /v1/customers`; associa o `vaulted_token` à pessoa. | Cofre/tabela privada do adaptador. |
| `merchant_customer_id` | Obrigatório ao criar customer | ID opaco do usuário no sistema do merchant. Não usar e-mail, CPF ou outro PII. | Mapeamento privado do adaptador. |
| `vaulted_token` | Necessário para pagamento reutilizável | Referência persistente do payment method na Yuno. | Somente cofre do adaptador, cifrado. |
| Yuno payment `id` | Necessário para reconciliação | UUID retornado na criação e aceito por `GET /v1/payments/{payment_id}`. | Tentativa de pagamento/ledger. |
| Yuno transaction `id` | Útil | Identifica a transação de `PURCHASE`; é um bom `provider_reference` normalizado. | Resultado/ledger. |
| `connection_data.id` | Útil para suporte | Identifica a conexão que processou a transação quando há mais de uma. | Telemetria interna allowlisted. |

O `merchant_id` usado na API de organizações B2B da Yuno pertence ao onboarding whitelabel de account groups e não é requisito do pagamento comum. Não introduzir essa hierarquia na BE-09 sem confirmação de que a organização é whitelabel. Ver [B2B Organization Management](https://docs.y.uno/docs/using-yuno/b2b-organization-management).

## 3. Autenticação, headers e configuração

A autenticação REST oficial usa dois headers em todas as chamadas:

- `public-api-key`;
- `private-secret-key`.

Operações mutáveis como criar pagamento e iniciar enrollment também exigem `X-Idempotency-Key`. Usar `Content-Type: application/json` e `Accept: application/json`. A referência canônica é [Authentication](https://docs.y.uno/reference/getting-started/authentication).

O `public-api-key` pode inicializar o SDK da Yuno no browser; o `private-secret-key` nunca pode sair do backend. Os exemplos devem conter apenas nomes de variáveis, nunca valores.

### Variáveis de ambiente propostas

| Nome | Sensibilidade | Finalidade |
|---|---|---|
| `YUNO_ENABLED` | Não secreta | Feature gate, desligada por padrão. |
| `YUNO_BASE_URL` | Não secreta | Deve apontar para sandbox na BE-09. |
| `YUNO_ACCOUNT_ID` | Confidencial operacional | Conta Yuno selecionada. |
| `YUNO_PUBLIC_API_KEY` | Publicável somente no SDK | Header/API e inicialização do SDK. |
| `YUNO_PRIVATE_SECRET_KEY` | Secreta | Header server-side. |
| `YUNO_COUNTRY` | Não secreta | País de processamento; proposta inicial `BR`, configurável. |
| `YUNO_WEBHOOK_HMAC_SECRET` | Secreta | Verificação HMAC do corpo bruto. |
| `YUNO_WEBHOOK_API_KEY` | Secreta | Valor esperado do header de webhook configurado no Dashboard. |
| `YUNO_WEBHOOK_SECRET` | Secreta | Valor esperado do segundo header estático de webhook. |
| `YUNO_REQUEST_TIMEOUT_MS` | Não secreta | Timeout do cliente abaixo do limite externo de 60 segundos. |

Não adicionar essas variáveis com valores a `.env.example`, Postman, CI output ou documentação. Um exemplo versionado pode listar somente os nomes.

## 4. Enrollment e tokenização segura

### Fluxo oficial aplicável

O caminho que mantém PAN e CVV fora dos servidores do Bound é:

1. backend cria ou recupera o customer com `POST /v1/customers`;
2. backend cria `POST /v1/customers/sessions` com `account_id`, customer `id` e país;
3. backend inicia o enrollment com `POST /v1/customers/sessions/{customer_session}/payment-methods`, usando UUID em `X-Idempotency-Key`;
4. uma Trusted Surface monta o Web SDK ou Secure Fields da Yuno com apenas `public-api-key` e `customer_session`;
5. PAN, validade e CVV transitam diretamente entre os secure fields/iframe e a Yuno;
6. backend confirma o estado `ENROLLED` por webhook e/ou `GET /v1/customers/{customer_id}/payment-methods`;
7. o adaptador grava `vaulted_token` em armazenamento cifrado e publica para o domínio apenas um `credential_id` lógico e display mascarado.

Fontes: [Enroll Payment Methods](https://docs.y.uno/docs/payment-features/enrollment/enroll-payment-methods), [Create Customer](https://docs.y.uno/reference/customers/create-customer), [Create Customer Session](https://docs.y.uno/reference/customer-sessions-enrollment/create-customer-session), [Web Enrollment](https://docs.y.uno/docs/sdks/card-enrollment/web-enrollment), [Secure Fields Enrollment](https://docs.y.uno/docs/sdks/customization/secure-fields/enrollment-secure-fields), [Retrieve Enrolled Payment Methods](https://docs.y.uno/reference/payment-methods-direct-workflow/retrieve-enrolled-payment-methods-api) e [PCI Compliance](https://docs.y.uno/docs/security-and-compliance/pci-compliance).

### Regra de boundary do Bound

O frontend comum, TravelBot e VuelaYa nunca recebem `vaulted_token`. A Trusted Surface de enrollment não deve copiar o token para store global, analytics, query string, error reporting ou resposta pública. O backend deve obter e correlacionar o enrollment pela consulta autenticada/webhook.

Esse boundary agora também é uma decisão aceita na ADR-004: Bound, Trusted Surface e TravelBot nunca capturam nem persistem segredo reutilizável do provider.

Há um bloqueio: a documentação do Web SDK informa que o callback `yunoEnrollmentStatus` recebe `vaultedToken`, e Secure Fields oferece `generateVaultedToken`. Isso significa que o token pode existir na memória do browser mesmo que o app o ignore. Como a ADR-004 proíbe a Trusted Surface de capturar ou persistir token reutilizável, é necessário confirmar com a Yuno um modo hosted/callback que permita ao backend recuperar o token sem expô-lo ao JavaScript da aplicação. Se isso não existir, a equipe deve registrar uma nova decisão arquitetural; este spike não cria uma exceção implícita.

O fluxo de enrollment `DIRECT` não é fallback aceitável: a Yuno o reserva a merchants PCI-compliant e ele ampliaria o escopo de dados de cartão.

## 5. Criação e consulta de pagamento

### Endpoint proposto para a BE-09

O adapter server-side chamaria `POST /v1/payments` com:

- `account_id` da configuração;
- `merchant_order_id` estável da tentativa;
- `merchant_reference` opaca;
- descrição sem PII;
- `country` da configuração/merchant, nunca do texto do agente;
- `amount.currency` e `amount.value` derivados da reserva;
- `customer_payer.id` recuperado pelo mapping privado do credential;
- `workflow: DIRECT`;
- `payment_method.type: CARD`;
- `payment_method.vaulted_token` recuperado somente dentro do adapter;
- single-step/capture e uma parcela, se a configuração da conta exigir o detalhe explícito;
- UUID persistido no header `X-Idempotency-Key`.

Ver [Create Payment](https://docs.y.uno/reference/payments/create-payment) e o exemplo oficial [Card Direct with vaulted token](https://docs.y.uno/reference/payments/payment-examples/cards#card-direct-with-vaulted-token).

O contrato do Bound usa inteiro em **minor units**; a Yuno recebe `amount.value` como valor numérico na moeda e admite casas decimais. Para BRL, o adapter deve converter de forma decimal exata:

```text
Bound { amount: 13700, currency: BRL } -> Yuno { value: 137.00, currency: BRL }
```

Nunca usar divisão em `number` binário sem validação. Formatar a partir do inteiro e do expoente ISO, comparar moeda/valor da resposta e só então reconstruir o `Money` local. Para BRL o expoente é 2; a [Country Reference](https://docs.y.uno/reference/country-reference) é a fonte da Yuno.

### Consultas e reconciliação

- `GET /v1/payments/{payment_id}` é a consulta principal quando o ID foi recebido.
- `GET /v1/payments?merchant_order_id=...` recupera por referência local estável e é essencial após timeout antes de existir `payment_id` local.
- Manter `raw_response=false`; respostas cruas do provider aumentam exposição e não são necessárias para normalização.
- Em retry do `POST`, reutilizar exatamente a mesma chave e o mesmo body.
- Nunca criar nova chave para “destravar” um timeout.

Fontes: [Retrieve Payment by ID](https://docs.y.uno/reference/payments/retrieve-payment-by-id) e [Retrieve Payment by Merchant Order ID](https://docs.y.uno/reference/payments/retrieve-payment-by-merchant-order-id).

## 6. Idempotência

A Yuno exige que `X-Idempotency-Key` seja um UUID. Ela guarda chave e resultado por 24 horas para respostas processadas; uma repetição retorna o resultado original. Chamadas simultâneas com a mesma chave podem retornar `409 Conflict`. Mesmo body diferente com a mesma chave não substitui a primeira operação. Segundo a documentação, falhas `400` e `500` não retêm a chave.

Implicações para o Bound:

- o `string` de `PaymentExecutor.pay` comporta UUID sem alteração;
- `idempotencyKeySchema` e os IDs atuais permitem valores que não são UUID, portanto não é seguro encaminhar qualquer chave local diretamente;
- a ADR sugere `authorization_id` como chave Yuno, mas fixtures como `authorization_vy_...` não atendem ao formato oficial;
- BE-08/BE-09 devem gerar e persistir um UUID Yuno por autorização, ou garantir que o próprio `authorization_id` seja UUID;
- a mesma chave deve sobreviver a restart, timeout e retry;
- após 24 horas, reconciliar por `merchant_order_id` antes de qualquer nova criação, pois a proteção da chave já pode ter expirado.

Não é necessária mudança no contrato v1; é necessária uma invariante de implementação e persistência.

## 7. Webhooks, assinatura e reconciliação

Configurar webhook **v2** para `payment.purchase` e, para enrollment, `enroll`, `unenroll`, `expiration` e `update`. A Yuno espera `200 OK`; sem confirmação, tenta até sete entregas, chegando a 96 horas após a primeira tentativa. Ver [Webhooks Overview](https://docs.y.uno/docs/webhooks), [Configure Webhooks](https://docs.y.uno/docs/webhooks/configure-webhooks) e [Webhook Object and Examples](https://docs.y.uno/docs/webhooks/object-and-examples).

### Verificação obrigatória no Bound

1. capturar os bytes exatos do corpo antes de parsear JSON;
2. calcular HMAC-SHA256 com `YUNO_WEBHOOK_HMAC_SECRET`;
3. codificar o digest em Base64;
4. comparar em tempo constante com `x-hmac-signature`;
5. validar também os headers estáticos `x-api-key` e `x-secret` configurados para o webhook;
6. rejeitar antes de qualquer mutação se assinatura, headers, versão ou `account_id` não forem esperados;
7. deduplicar a entrega pelo `idempotency_key` do evento e contexto do evento;
8. aplicar transição monotônica, vinculando `payment.id`, `merchant_order_id`, amount e currency à tentativa local;
9. responder `200` somente depois de persistir duravelmente o evento, ou após detectar duplicata já persistida.

A assinatura é `HMAC-SHA256(raw body, secret)` em Base64. O guia oficial está em [Verify Webhook Signatures (HMAC)](https://docs.y.uno/docs/webhooks/verify-webhook-signatures-hmac).

O HMAC não fornece sozinho freshness. A proteção contra replay do Bound depende da deduplicação persistente e da máquina de estados. Não registrar o corpo completo: os exemplos da Yuno mostram PII, token, dados de browser e detalhes do provider no payload.

### Estratégia de reconciliação

1. webhook válido é o caminho normal de atualização;
2. após timeout/`409`/estado não terminal, consultar por `payment_id` ou `merchant_order_id` com backoff limitado;
3. usar `status` e `sub_status` do payment como fonte principal, conforme orientação da Yuno;
4. se webhook e GET divergirem, obter o payment por ID novamente e aplicar a versão mais recente por `updated_at` sem regredir estado terminal;
5. manter a autorização `PAYMENT_PENDING` enquanto o resultado econômico for desconhecido;
6. escalar para operação se continuar desconhecido depois da janela definida; jamais criar um segundo pagamento automaticamente.

## 8. Estados e mapeamento para `PaymentResult`

A Yuno documenta fluxos síncronos, que chegam diretamente a terminal, e assíncronos, que passam por `PENDING`. `ERROR` pode ocorrer em qualquer ponto. Ver [Payment Status and Response Codes](https://docs.y.uno/reference/payments/status-and-response-codes/payment) e [Transaction Status and Response Codes](https://docs.y.uno/reference/payments/status-and-response-codes/transaction).

| Observação Yuno/HTTP | `PaymentResult` | Regra |
|---|---|---|
| `SUCCEEDED` + `APPROVED`, amount integralmente confirmado | `APPROVED` | Único happy path da BE-09. |
| `DECLINED` ou `REJECTED` terminal | `DECLINED` | `decline_code` recebe `response_code` normalizado; fallback para `sub_status`/`status`. |
| Timeout do cliente sem resposta interpretável | `TIMEOUT` | É resultado econômico desconhecido; iniciar reconciliação com a mesma tentativa. |
| `CREATED`, `READY_TO_PAY` ou `PENDING/*` | `UNKNOWN` com `payment_id` | Não tratar como recusa e não liberar nova tentativa. |
| `ERROR/TIMEOUT`, resposta `5xx`, payload inválido ou conexão interrompida após envio | `UNKNOWN` ou `TIMEOUT` | Conservar `PAYMENT_PENDING` até GET/webhook. |
| `409` para a mesma chave em andamento | `UNKNOWN` | Aguardar e consultar; não trocar a chave. |
| `400`, `401` ou `403` | erro operacional do adapter | Rejeitar a Promise com erro sanitizado; não é recusa do emissor. |
| `PARTIALLY_APPROVED`, refund, cancel, chargeback ou estado inesperado | `UNKNOWN` na BE-09 | Fora do caminho single-card/single-step; requer tratamento próprio antes de produção. |

`TIMEOUT` descreve a observação de transporte do Bound, não prova falha do pagamento. `UNKNOWN` descreve uma resposta ou reconciliação sem conclusão econômica. Ambos impedem uma nova cobrança.

### Campos do `PaymentResult`

| Campo local | Fonte/regra |
|---|---|
| `authorization_id` | Entrada `AuthorizedPayment.authorization.authorization_id`; nunca confiar em metadata externa para reconstruí-lo. |
| `amount` | `reserved_amount`, somente depois de validar igualdade exata com `payment.amount` após conversão de unidades. |
| `occurred_at` | `payment.updated_at` do estado observado; fallback controlado para o instante UTC de recebimento se o provider não devolver timestamp válido. |
| `status` | Tabela de mapeamento acima. |
| `payment_id` | Yuno payment `id`, quando conhecido. |
| `provider_reference` | Yuno transaction `id` da transação `PURCHASE`; evitar `raw_response` e IDs arbitrários que não passem pelo schema local. |
| `decline_code` | `transactions[].response_code`, limitado e allowlisted; fallback `sub_status`/`status`. Nunca usar mensagem livre do provider. |

Antes de mapear `APPROVED`, validar também `account_id`, `merchant_order_id`, currency e amount. Qualquer mismatch é incidente e `UNKNOWN`, não sucesso.

## 9. Brasil, cartões de teste e 3DS

### Brasil

- País de processamento: `BR`.
- Moeda local: `BRL`, com duas casas decimais.
- Código telefônico: `55`.
- Tipos de documento listados pela Yuno: RG, CPF, CNPJ, CNH e passaporte; os tipos normalizados incluem `national_id`, `tax_id_person`, `tax_id_entity`, `drivers_license` e `passport`.
- Campos de customer, billing/shipping, CPF/CNPJ e regras de parcelamento podem variar por provider e configuração do Checkout Builder; não presumir que sejam sempre opcionais só porque o schema geral os marca assim.
- Para a primeira prova, usar uma parcela e sem parcelamento/fallback complexo. Installments dependem da conexão e podem alterar routing.
- O Yuno Testing Gateway aceita qualquer país/moeda, portanto um sucesso nele não prova que um adquirente brasileiro aceite USD, os mesmos campos ou o mesmo routing.

O checkout atual do projeto usa USD. Antes da BE-09 ao vivo, decidir se o sandbox P0 continuará em USD com país `BR` apenas no gateway de teste ou se a fixture autorizada será convertida para BRL. Essa decisão deve manter amount/currency idênticos entre checkout, reserva e Yuno; o adapter nunca converte câmbio implicitamente.

### Cartões de teste

A Yuno publica cartões separados para sucesso, fundos insuficientes, recusa bancária, `DO_NOT_HONOR`, CVV inválido, dados inválidos, cartão roubado e erro no [Yuno Testing Gateway](https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway). Há cartões próprios para cenários 3DS em [3DS Configuration and Testing](https://docs.y.uno/docs/direct-integration-use-cases/3ds-configuration-and-testing).

Não copiar PAN, CVV ou validade desses cartões para este repositório. O operador consulta a página oficial no momento do teste e digita os dados diretamente nos campos seguros da Yuno. Fixtures usam apenas IDs sintéticos e display mascarado que não corresponda a um PAN completo.

### 3DS

- 3DS deve ser configurado na conexão e no routing.
- A Yuno suporta resultados frictionless e challenge; o challenge pode levar o payment a `PENDING/WAITING_ADDITIONAL_STEP`.
- SDK/Secure Fields cuidam da coleta e da experiência sem enviar PAN ao Bound.
- Fluxos de cartão `DIRECT` com 3DS requerem PCI segundo a documentação oficial.
- Um challenge exige ação humana. TravelBot nunca recebe `redirect_url`, OTP, CAVV/cryptogram ou ferramenta para concluir o desafio.
- Na BE-09, o teste autorizado deve selecionar o cartão oficial de sucesso sem challenge. Se a resposta pedir ação adicional, retornar `UNKNOWN`, manter `PAYMENT_PENDING` e parar.

Produção precisará de uma etapa na Trusted Surface para 3DS e de um resultado assíncrono persistente; isso está fora deste spike. Ver [3D Secure](https://docs.y.uno/docs/security-and-compliance/3d-secure).

## 10. Dados permitidos e proibidos

### O Bound pode armazenar

No domínio/ledger geral:

- `credential_id` lógico, não resolvível fora do adapter;
- display mascarado, como marca e últimos quatro dígitos;
- `authorization_id`, `checkout_id`, merchant local, amount/currency e correlation ID;
- Yuno payment `id`, Yuno transaction `id`, estados normalizados e timestamps;
- decline code normalizado e allowlisted;
- hashes e evidências que não contenham segredo ou PII.

Somente no armazenamento privado e cifrado do adapter:

- Yuno customer `id`;
- `vaulted_token`;
- mapping `credential_id -> customer_id + vaulted_token + account_id`;
- fingerprint, se realmente necessário para deduplicação e com política de retenção própria.

Somente em secret manager/configuração protegida:

- private/public API keys usadas pelo backend;
- segredos e valores estáticos de webhook;
- qualquer credencial de conexão/provider.

### Nunca podem chegar a frontend comum, TravelBot, VuelaYa, logs ou fixtures

- PAN completo ou parcial além do display estritamente mascarado;
- CVV/CVC e resultados brutos de verificação;
- validade completa, track data, PIN ou cardholder name;
- one-time token, `vaulted_token`, network token ou provider token;
- cryptogram, CAVV, ECI, OTP e dados internos de 3DS;
- `private-secret-key`, webhook secrets ou credenciais de provider;
- CPF/CNPJ/RG/passaporte, data de nascimento, telefone, e-mail e endereços;
- customer session depois de expirar ou fora da Trusted Surface de enrollment;
- browser info, IP, device fingerprint e payload Yuno completo;
- `provider_data.raw_response`, redirect URLs e recibos não sanitizados;
- headers de request/response autenticados e bodies de webhook completos.

O `public-api-key` é a única chave prevista pela Yuno para uso no SDK do browser. Mesmo não sendo segredo equivalente à chave privada, deve ser restrita ao ambiente e origem corretos e nunca ser reutilizada como autenticação do backend.

Redaction deve reconhecer pelo menos os nomes `public-api-key`, `private-secret-key`, `x-api-key`, `x-secret`, `x-hmac-signature`, `authorization`, `token`, `vaulted_token`, `network_token`, `cryptogram`, `security_code`, `document_number`, `email`, `phone`, `billing_address`, `shipping_address` e `raw_response`.

## 11. Compatibilidade do contrato atual

### Veredito

**Sim, de forma condicional, para a BE-09 sandbox estreita. Não, isoladamente, para o fluxo de produção completo.**

O port atual é suficiente porque:

- recebe a reserva autorizada, incluindo merchant, checkout e amount/currency;
- recebe somente um `credential_id` lógico e display;
- permite que o adapter resolva customer/token internamente;
- recebe uma chave de idempotência;
- `PaymentResult` cobre sucesso, recusa, timeout e resultado desconhecido;
- a Promise pode rejeitar para erros de configuração/autenticação que não são resultados de pagamento.

Condições sem as quais a implementação não é segura:

1. a chave passada a Yuno deve ser UUID persistido, não qualquer string aceita pelo contrato local;
2. `country`, `account_id`, customer Yuno e merchant order devem vir de configuração/mapping confiável, não do agente;
3. minor units devem ser convertidas de forma exata para o valor na moeda esperado pela Yuno;
4. o happy path deve aceitar somente terminal `SUCCEEDED/APPROVED` com bindings validados;
5. webhook/reconciliação e persistência de `PAYMENT_PENDING` devem existir ao redor do port;
6. challenge 3DS e métodos assíncronos permanecem fora da BE-09.

Lacunas para produção, sem proposta de alterar v1 neste spike:

- não há `PENDING` explícito nem detalhes de `action_required`;
- não há método de `get/reconcile` ou atualização por webhook no port;
- `TIMEOUT` não leva `payment_id` quando ele é descoberto depois;
- `UNKNOWN` não explica motivo, próxima ação ou versão do estado;
- captura em duas etapas, cancelamento, refund, partial approval e chargeback não pertencem ao contrato;
- o port não força UUID nem carrega país/customer/account.

Essas lacunas podem ser contornadas na BE-09 com serviço de aplicação e storage adjacentes, sem modificar os contratos v1.

## 12. Fluxo proposto para a BE-09

```text
Enrollment humano na Trusted Surface
  -> Yuno SDK/Secure Fields
  -> Yuno customer + payment method ENROLLED
  -> adapter guarda token e publica só credential_id lógico

TravelBot requestPurchase
  -> VuelaYa checkout assinado
  -> Bound Verify + reserva ALLOW
  -> persistir PAYMENT_PENDING + UUID Yuno
  -> YunoPaymentExecutor resolve credential internamente
  -> POST /v1/payments uma única vez, com bindings da reserva
       -> APPROVED: consumir autorização e concluir order
       -> DECLINED: falhar autorização com decline code normalizado
       -> TIMEOUT/UNKNOWN: manter pendente e reconciliar
  -> webhook HMAC + GET confirmam estado terminal
```

### Decisão enquanto não houver conta Yuno

Até a organização receber acesso ao Test Mode:

- `FakePaymentExecutor` é o único executor permitido em desenvolvimento, testes, CI e demonstrações;
- o dataset local deve semear para Marta uma referência lógica sintética, sanitizada e tratada como `ACTIVE` somente no ambiente fake;
- ativação de mandato financeiro deve falhar quando a credencial estiver ausente, inativa ou pertencer a outro principal, conforme a ADR-004;
- a credencial fake nunca recebe `vaulted_token`, Yuno customer `id` ou outro mapping que possa fazê-la parecer uma credencial Yuno real;
- `YUNO_ENABLED` permanece desligado por padrão e não pode ser ativado sem configuração validada;
- ausência de configuração Yuno seleciona explicitamente o fake ou falha de forma segura, nunca tenta alcançar a API externa;
- o fake deve devolver resultados determinísticos para `APPROVED`, `DECLINED`, `TIMEOUT` e `UNKNOWN` usando apenas os contratos v1;
- replay da mesma chave deve devolver o mesmo resultado e nunca criar uma segunda tentativa lógica;
- fixtures contêm somente IDs sintéticos, display mascarado e códigos normalizados — nenhum token, PAN, CVV ou payload copiado da Yuno;
- logs devem deixar claro `payment_provider=fake` para que a demonstração não seja apresentada como pagamento Yuno real;
- UI, receipt e roteiro da demo devem rotular o resultado como pagamento simulado em merchant controlado;
- a BE-09 de integração real permanece bloqueada por acesso e não deve ser marcada como concluída com base no fake.

Quando a conta chegar, o caminho live-sandbox será habilitado por configuração explícita e validado separadamente. Não haverá fallback automático do executor Yuno para o fake durante uma tentativa: isso poderia transformar uma falha externa em falso sucesso.

## 13. Bloqueios antes de implementar ou testar

1. **Acesso:** Test Mode, keys, `account_id`, permissões e allowlist de IP ainda não foram validados.
2. **Configuração:** Yuno Testing Gateway, rota CARD publicada, Checkout Builder e webhook v2 não foram confirmados no Dashboard.
3. **PCI/AOC:** a documentação enquadra o fluxo `DIRECT` de cartão como PCI-only, inclusive com cartão tokenizado no exemplo. Confirmar por escrito com a Yuno se a conta pode fazer cobrança server-side com um `vaulted_token` enrolled via SDK e qual AOC é exigido.
4. **Token no browser:** confirmar um enrollment hosted/server-retrieved compatível com a regra de que `vaulted_token` reutilizável não alcance o JavaScript da aplicação.
5. **Idempotência:** definir quem gera e persiste o UUID Yuno; `authorization_id` atual não é necessariamente UUID.
6. **Moeda:** confirmar transformação minor-unit/valor Yuno e escolher USD versus BRL para o cenário VuelaYa brasileiro, sem câmbio implícito.
7. **Customer:** definir mapping opaco de Marta para Yuno customer `id`, retenção e deleção.
8. **Estados:** aprovar a tabela de normalização, especialmente `ERROR/TIMEOUT`, `REJECTED`, partial approval e `409`.
9. **3DS:** confirmar que o caso autorizado da BE-09 usa cartão sem challenge e que qualquer challenge para imediatamente em `UNKNOWN`.
10. **Webhook:** disponibilizar endpoint HTTPS, segredo HMAC separado, deduplicação durável e política de resposta/retry.
11. **Autorização humana:** obter autorização explícita antes do primeiro enrollment mutável ou pagamento de sandbox.

Enquanto os bloqueios acima existirem, o `FakePaymentExecutor` é a decisão vigente e suficiente para manter o vertical local determinístico; ele não remove nem reduz nenhum dos gates da integração Yuno.

## 14. Fontes oficiais Yuno

- [API environments](https://docs.y.uno/reference/getting-started/api-environments)
- [Authentication and idempotency](https://docs.y.uno/reference/getting-started/authentication)
- [Developers and credentials](https://docs.y.uno/docs/using-yuno/settings/developers-credentials)
- [Yuno Testing Gateway](https://docs.y.uno/docs/direct-integration-use-cases/yuno-testing-gateway)
- [Enrollment overview](https://docs.y.uno/docs/payment-features/enrollment/enroll-payment-methods)
- [Secure Fields enrollment](https://docs.y.uno/docs/sdks/customization/secure-fields/enrollment-secure-fields)
- [PCI compliance](https://docs.y.uno/docs/security-and-compliance/pci-compliance)
- [Tokens](https://docs.y.uno/docs/basic-concepts/tokens)
- [Create payment](https://docs.y.uno/reference/payments/create-payment)
- [Card payment examples](https://docs.y.uno/reference/payments/payment-examples/cards)
- [Retrieve payment by ID](https://docs.y.uno/reference/payments/retrieve-payment-by-id)
- [Retrieve payment by merchant order ID](https://docs.y.uno/reference/payments/retrieve-payment-by-merchant-order-id)
- [Payment statuses](https://docs.y.uno/reference/payments/status-and-response-codes/payment)
- [Transaction statuses and response codes](https://docs.y.uno/reference/payments/status-and-response-codes/transaction)
- [Webhooks](https://docs.y.uno/docs/webhooks)
- [Webhook configuration](https://docs.y.uno/docs/webhooks/configure-webhooks)
- [Webhook signatures](https://docs.y.uno/docs/webhooks/verify-webhook-signatures-hmac)
- [Webhook v2 object and examples](https://docs.y.uno/docs/webhooks/object-and-examples)
- [Country reference](https://docs.y.uno/reference/country-reference)
- [3D Secure](https://docs.y.uno/docs/security-and-compliance/3d-secure)
- [3DS configuration and testing](https://docs.y.uno/docs/direct-integration-use-cases/3ds-configuration-and-testing)
