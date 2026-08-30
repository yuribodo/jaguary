# ADR-008: Deterministic purchase-dispute adjudication

## Status

Accepted.

## Context

The agentic purchase demo already preserves the mandate, agent identity, merchant checkout, authorization, payment, order, receipt, and hash-chain ledger. A cardholder who later says “I never authorized this” needs a result that explains who is responsible. Letting an LLM or a mutable current mandate state decide that question would make the result non-repeatable and could incorrectly rewrite history after a legitimate later revocation.

The challenge permits a mock payment rail, but expects the dispute outcome and its evidence to be visible to the human, merchant, and auditor.

## Decision

Jaguary accepts one owner-authenticated `UNRECOGNIZED_PURCHASE` dispute per receipt. It evaluates only persisted evidence from the completed purchase:

1. receipt ownership;
2. checkout, merchant, amount, currency, order, and payment bindings;
3. signed mandate authority at `authorization.reserved_at`;
4. agent identity bound into the reservation event;
5. the approved payment and confirmed order;
6. the validated append-only audit chain.

All checks passing produces `AUTHORIZED`, assigns liability to `PRINCIPAL`, and records `NO_CHARGEBACK`. Any failed check produces `UNAUTHORIZED`, assigns liability to `MERCHANT`, and records the mock outcome `CHARGEBACK_RECORDED`.

Opening, evidence evaluation, and resolution are stored with the dispute row in one PostgreSQL transaction and emitted as three events on a dedicated dispute subject chain. Idempotency prevents duplicate adjudication. Current mandate or agent status does not retroactively alter historical authority; the decision uses the state and signed evidence that existed when the authorization was reserved.

## Alternatives considered

- **Manual merchant response window:** more realistic, but introduces merchant authentication, deadlines, evidence uploads, and workflow states that do not improve the challenge's core authority proof.
- **LLM adjudication:** flexible for narratives, but unsuitable for assigning financial responsibility. Model output remains outside the decision boundary.
- **Automatic refund or provider chargeback API:** would imply a real settlement effect that the current fake payment runtime cannot honestly provide.
- **Judge against current mandate status:** simpler, but wrong after legitimate post-purchase revocation or expiry.

## Consequences

- Judges can open a dispute from the purchase receipt and immediately inspect a repeatable outcome and complete audit trail.
- The merchant receives a stable evidence package and liability result without raw card data, proofs, or provider secrets.
- The financial result is explicitly simulated. Production work still requires provider-specific dispute submission, asynchronous network states, evidence deadlines, notifications, and reconciliation.
