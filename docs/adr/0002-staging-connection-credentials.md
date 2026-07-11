# ADR 0002: Start with encrypted static staging credentials

- Status: Accepted
- Date: 2026-07-11

## Context

Shadow Mode must authenticate to a Design Partner's staging API. Supporting every OAuth grant, token exchange, mTLS arrangement, and cloud workload identity before a real customer requires it would delay validation. Passing an upstream credential to the Agent Customer would destroy the isolation Agent Access is meant to provide.

## Decision

The first connector accepts an API key or bearer token for one staging environment. The credential is encrypted before persistence, decrypted only during server-side forwarding, never returned after creation, and never included in logs, receipts, browser state, or agent-facing responses.

The connection is restricted to an approved HTTPS origin. The product provides connection testing, credential rotation, and immediate revocation. OAuth and workload identity are deferred until a Design Partner requirement justifies a specific flow.

## Consequences

- The first integration covers the common staging-API path with a small implementation surface.
- Agent Access becomes responsible for encryption-key management, origin validation, redirect handling, redaction, and safe failure reporting.
- Some vendors cannot connect until their required OAuth or mTLS flow is supported.
- Adding OAuth later does not change the Agent Credential or Delegation model.
