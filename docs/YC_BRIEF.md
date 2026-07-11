# YC brief

## One sentence

Agent Access lets SaaS companies accept AI agents as real customers with machine discovery, scoped accounts, delegated credentials, policy enforcement, and signed execution receipts.

## Problem

External agents currently impersonate humans or reuse broad API keys. SaaS vendors have no standard way to answer: which agent is acting, for whom, with what authority, for how long, and what exactly did it do?

## Initial customer

Developer-first B2B SaaS companies with 10–200 employees, an existing REST/OpenAPI API, and inbound demand for MCP or agent access. The buyer is the CTO or VP Engineering; the champion is the API or platform lead.

## Wedge

Import OpenAPI → review safe policies → publish a sandbox → let an external agent discover, register, receive delegated access, execute, and return a signed receipt.

## Why now

Agents can already browse and call tools, but the software underneath still assumes a human session. As vendors expose MCP and agent APIs, identity and authorization become the deployment blocker.

## What is unusual

This is not another agent builder. It is infrastructure for the SaaS vendors those agents need to use. The agent is a first-class account, not a bot token attached to a human.

## MVP proof

The repository contains the real vertical slice: OpenAPI parsing, risk classification, tenant isolation, publishable discovery, agent registration, delegated short-lived credentials, MCP and REST invocation, idempotency, rate limits, audit events, and cryptographically signed receipts.

## Validation plan

Run 15 design-partner interviews in three weeks with API/platform leaders. Ask for a real OpenAPI spec and one external-agent workflow. Success is five sandbox imports, three repeated agent executions, and two written design-partner commitments. Do not optimize fundraising materials until repeated product use appears.

## Demo script

1. Import a real vendor OpenAPI file.
2. Show a dangerous operation defaulting to approval-required or prohibited.
3. Publish the sandbox and open its discovery document.
4. Run verification: a new agent account, delegation, one-time credential, and capability invocation are created live.
5. Show the signed receipt, credential hash-only storage, and audit event.
