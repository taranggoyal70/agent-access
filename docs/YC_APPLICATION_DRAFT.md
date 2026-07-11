# YC application draft

This draft is deliberately truthful. Replace brackets only with verified facts.

## What is your company going to make?

Agent Access lets SaaS companies connect their existing API and safely serve external AI agents. We import their OpenAPI contract, identify risky actions, keep upstream credentials away from agents, issue delegated short-lived access, and return a signed receipt for every execution.

## What does the product do today?

A SaaS company can import an OpenAPI contract by URL, file, or paste; review a security preflight; connect a staging API using an encrypted credential; publish reviewed read-only capabilities over REST and MCP; register an external agent; and verify a real upstream execution through a redacted signed receipt. Contract changes create immutable revisions and never expand existing agent permissions automatically.

## Where do you live, and where will the company be based?

[Founder location and intended company location.]

## How far along are you?

The product is live at https://agent-access.vercel.app. It has a real database-backed control plane, REST and MCP data plane, staging Shadow Mode, delegated credentials, import revision review, audit events, rate limits, and signed receipts. Automated tests include a live read-only call to an external HTTPS API.

Current external usage: [0 until a real design partner connects].

## How long have you worked on this, and how much was full-time?

[Exact start date, hours, and whether full-time.]

## Do people use the product?

[As of DATE: N connected design partners, N weekly verified upstream executions, N retained four weeks. Do not count synthetic smoke tests.]

## Do you have revenue?

[No / exact monthly revenue and customer count.]

## Why did you choose this idea?

AI agents already use SaaS products, but they often impersonate a human or receive a broad API key. SaaS vendors cannot reliably answer which agent acted, for whom, under what authority, or what changed. Existing IAM products manage identities and MCP gateways expose tools, but a small SaaS team still has to stitch together contract onboarding, per-agent authority, safe execution, and evidence. Agent Access turns that work into one workflow.

## Who are your competitors, and what do you understand that they do not?

Competitors and adjacent products include enterprise IAM vendors, secrets platforms, agent gateways, MCP infrastructure, and internal implementations. The wedge is not generic agent identity. Small SaaS vendors need to turn an existing API into a safe product for outside agents quickly. We start at the OpenAPI contract, connect staging, prevent automatic authority expansion, and prove a real action end to end.

## How will you make money?

Charge SaaS vendors for connected environments and verified upstream execution volume, with enterprise pricing for retention, asymmetric receipt signing, SSO, and compliance exports. Initial paid pilots should test willingness to pay before final pricing is fixed.

## Category

B2B developer infrastructure / security / software for agents.

## What other ideas did you consider?

[Answer honestly. Mention the earlier exploration only if it clarifies why this problem was chosen.]

## Equity, incorporation, and fundraising

[Founder ownership, legal entity, funding, commitments, and fundraising status.]

## Evidence still required before submission

- Three active Design Partners
- More than 100 weekly verified upstream executions
- Two partners retained for four weeks
- One paid pilot or written commercial commitment
- Exact founder history and company ownership
