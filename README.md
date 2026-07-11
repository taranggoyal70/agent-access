# Agent Access

The account and access layer for AI-agent customers.

Agent Access lets a B2B SaaS vendor import an OpenAPI 3.x contract, classify each capability by risk, publish an isolated agent sandbox, register external agents as first-class accounts, issue delegated short-lived credentials, and produce a signed receipt for every execution.

## Why this exists

Human identity products assume a person can open a browser, complete a form, and hold a long-lived session. External AI agents need discoverable machine contracts, scoped authority, predictable errors, idempotent execution, and evidence of exactly what happened. Agent Access provides that missing layer without replacing the vendor's existing identity system.

## Working product flow

1. Sign in with Clerk and import an OpenAPI JSON or YAML document.
2. Review generated capabilities and choose `read_only`, `reversible`, `approval_required`, or `prohibited`.
3. Publish a Neon-backed sandbox with discovery, REST, and MCP endpoints.
4. Register a test agent and receive a one-time, one-hour delegated credential.
5. Invoke a real sandbox capability with an idempotency key.
6. Inspect the signed execution receipt and audit trail.

No product data is stored in browser local storage. Application records live in Postgres. Credential secrets are stored only as SHA-256 hashes, and receipt signatures use a server-side HMAC secret.

## Stack

- Next.js 16 App Router and TypeScript
- Clerk authentication
- Neon Postgres
- Vercel deployment
- Zod, YAML, Vitest, Tabler Icons

## Local setup

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Required variables are documented in `.env.example`.

## Verification

```bash
npm run check
npm run smoke
```

`check` runs lint, unit tests, TypeScript, and a production build. `smoke` creates an isolated temporary tenant in Neon and verifies the real register → delegate → credential → invoke → signed receipt → idempotent replay path, then removes the fixture.

## Machine endpoints

- `GET /.well-known/agent-access/{sandbox-slug}`
- `POST /api/agent/v1/{sandbox-slug}/accounts`
- `GET /api/agent/v1/{sandbox-slug}/capabilities`
- `POST /api/agent/v1/{sandbox-slug}/invoke/{operation-id}`
- `POST /mcp/{sandbox-slug}`
- `GET /api/receipts/{receipt-id}`

## Product and security docs

- [YC brief](docs/YC_BRIEF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Security model](docs/SECURITY.md)
- [Domain glossary](CONTEXT.md)

## Current boundary

This release is a production-quality sandbox MVP, not a general-purpose reverse proxy. It emulates a vendor's resources inside an isolated database-backed sandbox. A future production connector will forward approved operations to the vendor's API using their existing tenant and authorization systems.
