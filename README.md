# Agent Access

The account and access layer for AI-agent customers.

Agent Access lets a B2B SaaS vendor import an OpenAPI 3.x contract, classify each capability by risk, publish an isolated agent sandbox, register external agents as first-class accounts, issue delegated short-lived credentials, and produce a signed receipt for every execution.

## Why this exists

Human identity products assume a person can open a browser, complete a form, and hold a long-lived session. External AI agents need discoverable machine contracts, scoped authority, predictable errors, idempotent execution, and evidence of exactly what happened. Agent Access provides that missing layer without replacing the vendor's existing identity system.

## Working product flow

1. Import an OpenAPI contract by HTTPS URL, file, or pasted JSON/YAML.
2. Review a server-side preflight covering references, authentication, origin safety, operation risk, and revision changes.
3. Connect a staging API with an encrypted bearer token or API-key credential.
4. Review generated capabilities and publish only read operations in Shadow Mode.
5. Register an external agent and receive a one-time, one-hour delegated credential.
6. Invoke the real staging API through REST or MCP with an idempotency key.
7. Inspect a signed receipt containing redacted metadata and request/response hashes.
8. Run the built-in agent against the sandbox and watch it discover capabilities, invoke them under a delegated credential, and leave a receipt for every call.

No product data is stored in browser local storage. Application records live in Postgres. Credential secrets are stored only as SHA-256 hashes, and receipt signatures use a server-side HMAC secret.

## Agent runtime

Agent Access runs its own agent against its own published surface.

The runtime holds no database handle and no vendor credential. It registers an Agent Account for the run, receives a one-hour delegated credential, and calls `/api/agent/v1/{slug}/...` over HTTPS exactly as an outside agent would, so a completed run is evidence that the published contract works rather than evidence that an internal path works.

Capability admission fails closed. `read_only` is invocable, `reversible` only when the run allows writes, `prohibited` never, and an unrecognised policy is withheld rather than admitted. `approval_required` capabilities are declared to the model but gated: reaching for one halts the run and the call never leaves the runtime.

Every run is bounded by steps, invocations, and wall-clock time, and records a named halt reason. Start one at `/dashboard/runs`, or `POST /api/agent-runs` with a `sandbox_slug` and a `goal`.

### Choosing a model provider

The runtime is not welded to one model vendor, because neither is the product. Set `AGENT_MODEL_PROVIDER`:

| Value | Needs | Notes |
| --- | --- | --- |
| `anthropic` (default) | `ANTHROPIC_API_KEY` | Paid. A Claude Pro subscription does **not** include API access. |
| `groq` | `AGENT_MODEL_API_KEY`, `AGENT_MODEL` | Free tier, rate limited |
| `github-models` | `AGENT_MODEL_API_KEY`, `AGENT_MODEL` | Free with a GitHub account, rate limited |
| `gemini` | `AGENT_MODEL_API_KEY`, `AGENT_MODEL` | Free tier via AI Studio |
| `openrouter` | `AGENT_MODEL_API_KEY`, `AGENT_MODEL` | Some models are free |
| `openai-compatible` | the above plus `AGENT_MODEL_BASE_URL` | Any other endpoint speaking OpenAI chat-completions with tool calling |

Whichever you pick is recorded on the run as `provider/model`, so a receipt trail always names what produced it. An unknown provider name is an error rather than a silent fall back to the default — a run labelled `anthropic/claude-opus-5` that came from somewhere else would corrupt the only thing this product sells.

The model must support tool calling, and the runtime checks before it commits to a run. A one-turn preflight probe asks the model to make a single tool call; if it answers in text instead, the run fails with `model_unsuitable` before an agent account is registered or anything is invoked.

That check exists because the failure it prevents is the worst kind: a model that cannot call tools answers the goal from its own head, invokes nothing, and the run is recorded as `completed` while proving nothing about the published surface. Pass `skipPreflight` only when the provider is already known good.

## Stack

- Next.js 16 App Router and TypeScript
- Pluggable model provider for the agent runtime: Anthropic SDK by default, or any OpenAI-compatible endpoint
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

`agent-smoke` proves the agent runtime the same way, against a real database, a real model, and the real HTTP surface. Point it at any running deployment, because the agent is an outside client:

```bash
# free provider
AGENT_MODEL_PROVIDER=groq AGENT_MODEL_API_KEY=... AGENT_MODEL=llama-3.3-70b-versatile \
AGENT_ACCESS_ORIGIN=https://agent-access.vercel.app npm run agent-smoke

# or the default
ANTHROPIC_API_KEY=... AGENT_ACCESS_ORIGIN=https://agent-access.vercel.app npm run agent-smoke
```

It asserts two things: a read-only goal completes with at least one delegated invocation whose receipt verifies, and a goal that can only be met by an `approval_required` capability halts with zero invocations.

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
- [YC readiness scorecard](docs/YC_READINESS.md)
- [Domain glossary](CONTEXT.md)

## Current boundary

This release is a production-quality sandbox MVP, not a general-purpose reverse proxy. It emulates a vendor's resources inside an isolated database-backed sandbox. A future production connector will forward approved operations to the vendor's API using their existing tenant and authorization systems.

The agent runtime makes the product demonstrable end to end without a second party. It does not make Agent Access used: it has no design partners and no external agent traffic. `docs/YC_READINESS.md` holds the current scoreboard.

Approval workflow is deferred. A gated run halts and records what was requested; granting that approval and resuming the run is not yet built. Runs execute inside the request that starts them, so queueing and resumption are deferred too.
