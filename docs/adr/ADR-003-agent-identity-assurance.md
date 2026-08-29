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

Em produção, um `AgentAttestationProvider` poderá complementar o registro local com:

- identidade e verificação do operador;
- provenance e build fingerprint atestados;
- status contínuo e revogação externa;
- vínculo verificável entre pessoa, organização e agente.

Trulioo KYA é o candidato de referência para essa atestação. Experian Agent Trust permanece uma alternativa de sinal de identidade e risco. Sinais probabilísticos externos podem contribuir para `ESCALATE` ou controles adicionais, mas não substituem as regras determinísticas que produzem `ALLOW`.

## Consequências

- O P0 não depende de um fornecedor externo de KYA.
- A identidade local prova posse da chave registrada e estado atual, não reputação universal.
- Atestações externas devem ser armazenadas com emissor, tipo, validade, status e evidência original.
- A indisponibilidade de um provedor externo nunca transforma uma identidade desconhecida em válida; a política falha fechada conforme sua configuração.
- O registro local permanece necessário mesmo quando uma atestação externa for adicionada.

## Critérios de aceitação

1. Nenhuma requisição financeira usa identidade apenas declarada.
2. Agentes suspensos ou revogados não criam autorização pagável.
3. Chaves privadas nunca entram no registro, em logs ou em fixtures.
4. A interface e a documentação diferenciam `Bound verified` de uma futura atestação externa.
5. Um provider externo pode ser adicionado sem alterar o modelo de mandato ou dar acesso direto ao pagamento.
