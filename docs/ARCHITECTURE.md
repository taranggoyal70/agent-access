# Architecture

## Trust boundary

The web console is a human control plane. Discovery, registration, REST, and MCP routes form the agent data plane. Both use the same reviewed capability contract, while credentials and signing secrets remain server-side.

## Core modules

- `openapi.ts`: validates and normalizes OpenAPI 3.x JSON/YAML into capabilities and safe policy defaults.
- `auth.ts`: maps Clerk users to tenant-scoped organizations.
- `registration.ts`: creates an agent account, principal delegation, and one-time credential.
- `execution.ts`: validates authority, enforces policy and rate limits, applies idempotency, mutates isolated sandbox resources, and signs a receipt.
- `receipts.ts`: canonical JSON serialization plus constant-time HMAC verification.

## Persistence

Neon Postgres stores organizations, projects, capabilities, sandboxes, principals, agent accounts, delegations, credential hashes, sandbox resources, executions, receipts, audit events, and rate windows. Foreign keys and tenant-filtered queries provide the main integrity boundaries.

## Surfaces

- Human: authenticated Next.js console.
- Discovery: vendor-specific well-known manifest.
- REST: registration, capability listing, invocation, and receipt verification.
- MCP: `initialize`, `tools/list`, and authenticated `tools/call`.

## Deployment

Vercel hosts the Next.js application. Clerk manages human authentication. Neon provides serverless Postgres. Secrets are configured separately for development, preview, and production.
