# Audit ledger core

The ledger is append-only and tamper-evident; it is not a blockchain and does not provide an external immutability guarantee. PostgreSQL roles with sufficient privileges can still replace the trigger or rewrite storage.

Every new payload is parsed by a strict, event-specific allowlist before storage. The ledger never accepts proof bodies, signatures, public/private key material, payment credentials, PAN, CVV, reusable provider tokens, or raw card data.

Hashes use the repository's RFC 8785 JSON Canonicalization Scheme implementation and SHA-256:

- `payload_hash = SHA-256(JCS(sanitized_payload))`
- `event_hash = SHA-256(JCS(event_hash_input))`

`event_hash_input` contains exactly these keys (JCS sorts them lexicographically):

```json
{
  "event_id": "...",
  "correlation_id": "...",
  "event_type": "...",
  "subject_id": "...",
  "payload_hash": "...",
  "previous_hash": null,
  "recorded_at": "UTC RFC 3339 with milliseconds"
}
```

Chains are scoped by `subject_id`. Mandate lifecycle and pre-authorization decisions use the mandate ID because no authorization exists for a denied request. A successful reservation starts an authorization-ID chain. Before reading the tip and inserting, the repository obtains a transaction-scoped PostgreSQL advisory lock derived from the subject ID. This serializes concurrent appends and prevents two committed tips.

The timeline is filtered by `correlation_id` and ordered by `recorded_at`, then causal linkage for same-subject ties, then `event_id`. The event ID gives a stable total order for unrelated events with identical timestamps.
