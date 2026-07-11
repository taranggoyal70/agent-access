# Design-partner outreach system

## Offer

Agent Access will connect one staging API and make one read-only workflow safely usable by an external agent. The first session is free and lasts 30 minutes. The partner supplies an OpenAPI contract and a concrete workflow; Agent Access handles preflight, policy review, staging mediation, delegated credentials, and signed evidence.

The goal is not a product tour. Success is a real external agent completing the workflow against staging.

## Qualification criteria

A strong prospect has all four:

1. A 10–50-person developer-first B2B SaaS company.
2. A public or private OpenAPI 3.x contract.
3. A founder, CTO, or API/platform lead who can connect staging.
4. A customer request or active roadmap item involving MCP or external-agent access.

Disqualify research-only teams, companies without an API, consultants seeking a demo, investors, and large-enterprise innovation groups without implementation ownership.

## Initial prospect hypotheses

These are research targets, not customers or endorsements. Verify team size, ownership, and current need before outreach.

| Priority | Prospect type | Example research targets | Why investigate |
| --- | --- | --- | --- |
| 1 | Workflow infrastructure | Trigger.dev, Inngest | Agents can trigger and inspect consequential customer workflows; both publish agent-facing tooling. |
| 1 | Webhook infrastructure | Hookdeck, Svix | External agents may inspect delivery failures or replay events, which needs bounded authority and evidence. |
| 1 | Developer communication APIs | Resend, Knock, Novu | Agent-triggered communication creates approval, tenant, and audit questions. |
| 2 | API security and keys | Unkey, Infisical | Existing machine identity products may need a delegated external-agent workflow or integration partnership. |
| 2 | Observability and incident tools | Better Stack, Axiom, OpenStatus | Read-only staging workflows are valuable and safer to validate than mutation-heavy APIs. |
| 2 | Developer documentation | Mintlify, Fern, Speakeasy | OpenAPI-driven agent onboarding is close to their customer workflow and may reveal partnership or competitive boundaries. |

## Cold email

Subject: Let one external agent use your staging API safely

Hi {{first_name}} — I noticed {{company}} is making more of its product accessible to coding agents / MCP clients.

I’m building Agent Access. It imports your existing OpenAPI contract, exposes only reviewed read operations to an external agent, keeps your staging credential server-side, and returns a signed receipt for every action.

I’m looking for three design partners. The test is concrete: in a 30-minute session, we connect staging and have an outside agent complete one real workflow. No production access and no slideware pilot.

Would you be willing to try it with one workflow next week?

Tarang

## Warm-introduction request

I’m looking for a founder or API lead at a 10–50-person developer-tool SaaS that has received an MCP or agent-access request. We connect one read-only staging workflow and prove it with a real external agent execution. Do you know one person who owns that problem and would be willing to try it next week?

## Discovery call

Do not begin with a demo. Ask:

1. What was the last agent-access or MCP request you received?
2. What did the customer want the agent to do?
3. How does that customer authenticate today?
4. What prevented you from shipping it immediately?
5. Which action would be safe enough to test against staging today?
6. Who must approve the connection?
7. If this worked, what would you replace or stop building internally?
8. Would you connect the contract now?

Record exact language, current workaround, urgency, authority owner, and willingness to connect. Compliments do not count as evidence.

## Follow-up rule

- Day 0: initial message.
- Day 3: one short follow-up with a relevant workflow suggestion.
- Day 8: final message offering to close the loop.
- Stop after three messages unless the prospect responds.

## Weekly founder activity target

- 40 qualified outbound messages
- 10 discovery calls
- 5 real contract preflights
- 3 staging connections
- 100 verified upstream executions
- 1 paid pilot or signed commitment
