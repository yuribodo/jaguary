# BE-09 — Fundação do adapter Yuno sandbox

## Estado deste slice

Este slice implementa somente a fundação segura e testável do pagamento Yuno. Ele não conclui a issue BE-09, não habilita o executor no composition root e não realiza enrollment, consulta ou pagamento no sandbox.

O executor fake continua sendo a única seleção do aplicativo. O adapter Yuno só é exercitado por testes com `fetch` e resolução de credencial injetados, sem rede.

## Configuração

`loadEnv` expõe uma configuração discriminada `env.yuno`:

- sem `YUNO_ENABLED`, o resultado é `{ enabled: false }`;
- `YUNO_ENABLED=true` exige `YUNO_BASE_URL`, `YUNO_ACCOUNT_ID`, `YUNO_PUBLIC_API_KEY`, `YUNO_PRIVATE_SECRET_KEY`, `YUNO_COUNTRY` e `YUNO_REQUEST_TIMEOUT_MS`;
- nesta fase, a única origem aceita é `https://api-sandbox.y.uno`, sem path, query, credenciais embutidas ou porta alternativa;
- o account ID precisa ser UUID, country precisa ter duas letras maiúsculas e o timeout precisa estar entre 1 e 59.000 ms;
- erros de configuração informam somente nomes de campos e regras, nunca valores.

O arquivo `.env.example` lista apenas os nomes. Chaves e account ID devem vir de secret manager e não devem ser enviados por chat, commit, log ou fixture.

## Boundary do executor

`YunoPaymentExecutor` implementa `PaymentExecutor v1`. Sua única entrada econômica é `AuthorizedPayment`; o segundo argumento é exclusivamente a chave de idempotência.

O request é montado assim:

| Campo Yuno | Fonte confiável |
| --- | --- |
| `account_id`, country, base URL e headers | configuração validada |
| `merchant_order_id` | `bound:` + `authorization_id` reservado |
| `merchant_reference` | `checkout_id` reservado |
| amount e currency | `reserved_amount` |
| Yuno customer ID e `vaulted_token` | `YunoCredentialResolver`, indexado pelo `credential_id` lógico |
| workflow e payment method | constantes `DIRECT` e `CARD` do adapter |

Não existe parâmetro adicional para amount, currency, merchant, customer ou credencial. O resolver precisa retornar também o account ID do mapping; divergência contra a configuração falha antes da chamada HTTP.

A chave de idempotência precisa ser UUID e nunca é gerada pelo adapter. Geração, persistência e reuso após restart pertencem à BE-10.

## Dinheiro e resultados

O slice permite apenas BRL e USD, ambos com expoente confiável 2. A conversão parte do inteiro em minor units, forma os dígitos decimais sem divisão binária e rejeita moeda sem mapping. Não há câmbio implícito.

Um resultado só vira `APPROVED` quando a resposta traz simultaneamente:

- `status=SUCCEEDED` e `sub_status=APPROVED`;
- payment ID válido;
- account ID e merchant order esperados;
- currency idêntica;
- valor reconstruído exatamente para os mesmos minor units.

Recusas terminais viram `DECLINED` com decline code sanitizado e allowlisted. Timeout local vira `TIMEOUT`. `409`, `5xx`, conexão interrompida, estado não terminal, payload malformado ou mismatch de binding viram `UNKNOWN`. Respostas `4xx` operacionais rejeitam com `YunoAdapterError` sanitizado.

`TIMEOUT` e `UNKNOWN` não autorizam nova cobrança; a tentativa deve continuar pendente para reconciliação pela BE-10.

## Dados sensíveis

O adapter não registra request, response, headers, customer mapping ou exceções originais. Seus erros contêm somente code e mensagem constantes e não anexam `cause` ou body do provider. Os testes verificam que chaves, headers, customer data, `vaulted_token`, network token, documento e `raw_response` não aparecem no erro.

Fixtures Yuno contêm somente IDs sintéticos, bindings econômicos, estados e timestamps. Um teste de segurança rejeita material de credencial, PII, payload bruto e números com formato de PAN.

## Wiring pendente depois da BE-10

O wiring deve ser feito somente após a BE-10 persistir um UUID Yuno por tentativa e entregá-lo em `PaymentExecutor.pay`. O store atual usa `authorization_id`, que não é necessariamente UUID e por isso é rejeitado pelo adapter.

Depois do merge/rebase da BE-10, o pequeno passo de integração é:

1. implementar `YunoCredentialResolver` sobre o storage privado e cifrado do adapter, sem expor o mapping ao domínio;
2. exportar o adapter em `backend/src/modules/payments/index.ts` se o composition root usar o barrel;
3. no composition root, selecionar explicitamente:

```ts
const paymentExecutor = env.yuno.enabled
  ? new YunoPaymentExecutor(env.yuno, {
      fetch: globalThis.fetch,
      credentialResolver: privateYunoCredentialResolver,
    })
  : new FakePaymentExecutor({
      outcome: "APPROVED",
      occurredAt: clock.now().toISOString(),
    })
```

4. injetar `paymentExecutor` no `PaymentService` já existente;
5. não capturar uma falha Yuno para trocar a tentativa pelo fake. A seleção ocorre uma vez no startup.

## Dependências externas ainda bloqueadas

Antes de qualquer chamada real de sandbox ainda é necessário:

- obter autorização explícita do usuário e credenciais Test Mode por canal seguro;
- confirmar account, allowlist de IP, Yuno Testing Gateway, route CARD e Checkout Builder publicados;
- confirmar com a Yuno a elegibilidade `DIRECT` com `vaulted_token` e o requisito PCI/AOC;
- resolver o enrollment sem expor token reutilizável ao JavaScript da aplicação;
- implementar storage cifrado do mapping de credential/customer/token;
- concluir a persistência idempotente, reconciliação e webhook da BE-10;
- escolher e validar o cenário USD ou BRL sem conversão cambial;
- executar primeiro uma consulta read-only autorizada e sanitizada.

Nenhum desses passos externos foi executado neste slice.
