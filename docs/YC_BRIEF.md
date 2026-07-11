# YC brief

## One sentence

Agent Access lets SaaS companies accept AI agents as real customers with machine discovery, scoped accounts, delegated credentials, policy enforcement, and signed execution receipts.

## Problem

External agents currently impersonate humans or reuse broad API keys. SaaS vendors have no standard way to answer: which agent is acting, for whom, with what authority, for how long, and what exactly did it do?

## Initial customer

Developer-first B2B SaaS companies with 10–200 employees, an existing REST/OpenAPI API, and inbound demand for MCP or agent access. The buyer is the CTO or VP Engineering; the champion is the API or platform lead.

## Wedge

Import OpenAPI → review safe policies → publish a sandbox → let an external agent discover, register, receive delegated access, execute, and return a signed receipt.

The first design-partner deployment connects to the vendor's staging API in read-only shadow mode. Real upstream responses and failures are mediated and receipted; writes remain disabled.

Onboarding accepts an OpenAPI document by HTTPS URL, file, or pasted JSON/YAML. A server-side preflight resolves the contract, reports authentication and risk, tests the staging origin, and requires explicit confirmation before creating an immutable Import Revision.

## Why now

Agents can already browse and call tools, but the software underneath still assumes a human session. As vendors expose MCP and agent APIs, identity and authorization become the deployment blocker.

## What is unusual

This is not another agent builder. It is infrastructure for the SaaS vendors those agents need to use. The agent is a first-class account, not a bot token attached to a human.

## MVP proof

The repository contains the real vertical slice: OpenAPI parsing, risk classification, tenant isolation, publishable discovery, agent registration, delegated short-lived credentials, MCP and REST invocation, idempotency, rate limits, audit events, and cryptographically signed receipts.

## Validation plan

Run 15 design-partner interviews in three weeks with API/platform leaders. Ask for a real OpenAPI spec and one external-agent workflow. Success is five sandbox imports, three repeated agent executions, and two written design-partner commitments. Do not optimize fundraising materials until repeated product use appears.

The first recruitment target is a 10–50-person developer-tool SaaS that already operates a public API and has received at least one customer request for MCP or external-agent access. A company only counts as a design partner after it provides a real contract and workflow; friendly conversations and investor interest do not count.

## North-star metric

The company measures weekly verified upstream executions by external agents at active Design Partners. An active Design Partner has connected a real staging API, published a reviewed Capability, executed through Agent Access in two separate weeks, and returned without founder prompting every session.

The minimum evidence target for a strong YC application is three active Design Partners, more than 100 verified upstream executions per week, two partners retained for four consecutive weeks, and at least one paying or formally committed customer. Accounts, sample imports, event conversations, GitHub stars, and synthetic executions do not count toward this metric.

## Demo script

1. Import a real vendor OpenAPI file.
2. Show a dangerous operation defaulting to approval-required or prohibited.
3. Publish the sandbox and open its discovery document.
4. Run verification: a new agent account, delegation, one-time credential, and capability invocation are created live.
5. Show the signed receipt, credential hash-only storage, and audit event.
