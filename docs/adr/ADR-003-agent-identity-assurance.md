# ADR-003 — Garantia de identidade do agente e evolução de KYA

- Status: Aceito
- Data: 2026-08-29
- Escopo: Bound MVP e evolução de identidade em produção
- Relacionado: [ADR-001](ADR-001-bound-mvp-architecture.md), [ADR-002](ADR-002-commerce-protocol-layering.md)

## Contexto

O Bound precisa distinguir um agente registrado de uma identidade apenas declarada. Entretanto, posse de uma chave cadastrada não equivale a uma certificação externa do operador, do build, da proveniência ou da relação entre pessoa e agente.

Soluções como Trulioo KYA, Experian Agent Trust e os programas de agentes das redes adicionam atestações externas, mas exigem disponibilidade comercial e onboarding que não podem bloquear o caminho determinístico do hackathon.

## Decisão

No MVP, o Bound será sua própria fonte operacional de identidade do agente:

- registra a chave pública e o vínculo entre `agent_id` e `principal_id`;
- verifica assinatura, algoritmo, `key_id`, validade e build fingerprint das requisições;
- mantém status `ACTIVE`, `SUSPENDED` ou `REVOKED`;
- vincula a requisição a método, rota, corpo, horário e nonce;
- registra evidências suficientes para auditoria e aplica replay protection na reserva transacional.

Esse mecanismo será descrito como **identidade do agente verificada criptograficamente pelo Bound**. A demo não alegará KYA certificado, certificação Visa/Mastercard ou verificação independente do operador.

BE-14 implementa a extensão de produção por interfaces neutras de fornecedor: `AgentAttestationProviderPort`, `AgentTrustRepositoryPort` e `AgentEligibilityPort`. O primeiro adapter real é Didit, limitado à claim `OPERATOR_IDENTITY`; ele não atesta build, chave ou o agente inteiro. O vínculo completo continua sendo produzido e assinado pelo Bound.

Os modos são:

- `LOCAL`, que mantém a confiança criptográfica local;
- `EXTERNAL_OPTIONAL`, que registra evidência sem bloquear o agente local;
- `EXTERNAL_REQUIRED`, que exige atestação vigente e binding de principal, agente, chave e build.

Uma atestação externa pode complementar o registro local com:

- identidade e verificação do operador;
- provenance e build fingerprint atestados;
- status contínuo e revogação externa;
- vínculo verificável entre pessoa, organização e agente.

Didit é o provider inicial. Trulioo, Experian, Skyfire, Vouched e KYA.link permanecem fora desta decisão/entrega. Sinais externos são apenas evidência normalizada e nunca produzem `ALLOW`; indisponibilidade em `EXTERNAL_REQUIRED` falha fechada.

O Bound emite um Agent Passport ES256 de curta duração após atestação válida. O passaporte contém somente hashes/referências opacas e binding de agente, principal, chave e build, com audience/purpose e expiração. Sua verificação local consulta o estado Bound atual, sem chamar Didit, e invalida por expiração/revogação da atestação, mudança de binding ou suspensão/revogação operacional.

## Consequências

- O P0 não depende de um fornecedor externo de KYA.
- A identidade local prova posse da chave registrada e estado atual, não reputação universal.
- Atestações externas armazenam provider, claims normalizadas, validade e somente hashes/referências opacas; payload original e PII do provider são proibidos.
- A indisponibilidade de um provedor externo nunca transforma uma identidade desconhecida em válida; a política falha fechada conforme sua configuração.
- O registro local permanece necessário mesmo quando uma atestação externa for adicionada.

## Critérios de aceitação

1. Nenhuma requisição financeira usa identidade apenas declarada.
2. Agentes suspensos ou revogados não criam autorização pagável.
3. Chaves privadas nunca entram no registro, em logs ou em fixtures.
4. A interface e a documentação diferenciam `Bound verified` de uma futura atestação externa.
5. Um provider externo pode ser adicionado sem alterar o modelo de mandato ou dar acesso direto ao pagamento.
6. Verify, mandatos, TravelBot e reserva usam a mesma decisão de elegibilidade; a reserva relê e trava o snapshot na própria transação.
7. Nenhuma chamada externa ocorre dentro de Verify, pagamento, mandato, TravelBot ou transação SQL.
