# Diagramas do Bound

## Guias técnicos focados

- [Trilho de autoridade resumido para o README](readme-authority-rail.html) ([SVG](readme-authority-rail.svg))
- [Contexto do sistema e fronteiras de confiança](system-context.html)
- [Sequência OpenAI + TravelBot](openai-travelbot-sequence.html)
- [Sequência de busca Google Flights via SerpApi](google-flights-search-sequence.html)
- [Sequência Didit + Trust](didit-trust-sequence.html)
- [Sequência de checkout UCP](ucp-checkout-sequence.html)
- [Sequência de autorização AP2 + Bound](ap2-bound-sequence.html)

As páginas explicativas e os limites de conformidade de cada integração estão no [índice técnico](../technical/README.md).

## Implementação atual

- [Como cada parte do Bound funciona hoje](bound-current-system.html) — arquitetura executável, superfícies frontend, TravelBot, compra, ciclos de estado, ledger e persistência.
- [Mapa dos 25 objetos persistidos por domínio](database-domain-map.html) — inventário completo e distinção entre FKs e vínculos lógicos.
- [Schema físico do núcleo de autorização](authority-database-schema.html) — colunas e relacionamentos de mandato, nonce, checkout, autorização e pagamento.

## Contexto de produto e decisões anteriores

- [Jornada e blueprint do produto](bound-product-experience.html)
- [Modelo de protocolos e pagamentos](bound-protocol-model.html)
- [Arquitetura técnica original do MVP](bound-technical-architecture.html)

O dossiê de implementação atual é a fonte visual para o comportamento existente no código. Os três documentos anteriores preservam contexto de produto, alternativas e decisões de arquitetura, inclusive itens que ainda não estão conectados ao runtime.
