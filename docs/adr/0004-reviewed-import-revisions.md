# ADR 0004: OpenAPI changes require reviewed promotion

- Status: Accepted
- Date: 2026-07-11

## Context

A Design Partner's API contract changes over time. Automatically applying every fetched OpenAPI change could expose new mutating operations, broaden schemas, change upstream origins, or invalidate an Agent Customer's integration. Existing Delegations must not gain authority merely because a source document changed.

## Decision

Every accepted OpenAPI document is stored as an immutable Import Revision. A new revision is compared with the currently applied revision and classified into safe, review-required, dangerous, and breaking changes.

The published Agent Sandbox remains unchanged until a Champion explicitly promotes the revision. Promotion never adds a Capability to an existing Delegation; newly introduced Capabilities require a separate authority decision.

## Consequences

- Vendors can continuously check a hosted specification without coupling document changes to runtime authority.
- The product must preserve revision history, stable operation identities, structured diffs, and promotion audit events.
- Emergency contract removals require an explicit fast revocation path rather than relying on the next import.
- Compatibility and policy analysis become central product value rather than incidental parser behavior.
