# ADR 0001: Prove value through staging shadow mode

- Status: Accepted
- Date: 2026-07-11

## Context

The first release publishes a database-backed synthetic Agent Sandbox from an OpenAPI Import. That demonstrates discovery, policy review, registration, delegated credentials, invocation, and Execution Receipts, but it does not prove that Agent Access can safely mediate a real SaaS Vendor API. A credible design partner and YC demo require evidence from an actual upstream system without placing production writes at risk.

## Decision

The first live connector will target a SaaS Vendor's staging environment in read-only shadow mode.

Import will validate the OpenAPI document, identify its upstream base URL and authentication requirements, test connectivity, and allow only reviewed read-only Capabilities to be invoked. Agent Access will forward those invocations to staging and record upstream latency, response status, policy decisions, and signed Execution Receipts. Mutating operations remain disabled until a later explicit decision.

## Consequences

- A design partner can prove the full workflow against its real data model without exposing production writes.
- Agent Access becomes part of the request path and must protect upstream credentials, prevent server-side request forgery, bound response sizes and timeouts, and redact sensitive evidence.
- Synthetic resources remain useful for evaluation but no longer constitute design-partner validation.
- Production write mediation, rollback, approval escalation, and reconciliation are deliberately deferred.
