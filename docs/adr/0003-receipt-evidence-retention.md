# ADR 0003: Receipts retain evidence, not customer payloads

- Status: Accepted
- Date: 2026-07-11

## Context

Execution Receipts must prove which authority and policy governed a real upstream invocation. Complete request and response bodies may contain personal information, regulated data, access tokens, or a Design Partner's proprietary records. Persisting every payload would make Agent Access an unnecessary secondary data store and increase breach impact.

## Decision

Receipts for Vendor Connection invocations store identity, authority, normalized route, body hashes, response status, latency, byte size, policy decision, timestamps, and explicitly allowlisted evidence fields. Raw authorization headers and known secret patterns are always removed.

Full request and response capture is disabled by default. A Champion may enable encrypted debugging capture for a bounded incident window, with automatic deletion after 24 hours. The signed receipt remains after payload deletion because its hashes and metadata are sufficient to detect alteration.

## Consequences

- Receipts remain useful for accountability without becoming a permanent copy of upstream customer data.
- Debugging may require a Design Partner to reproduce an issue unless temporary capture was enabled.
- Evidence-field allowlists and redaction behavior become part of the Vendor Connection contract.
- Retention deletion must be independently testable and visible in the audit log.
