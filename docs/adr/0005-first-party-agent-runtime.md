# ADR 0005: Run a first-party agent through the public surface

- Status: Accepted
- Date: 2026-09-17

## Context

Agent Access models external AI agents as first-class customers, but until now no agent existed anywhere in the system. The product could be demonstrated only by a human driving a console or by hand-written cURL, which proves the endpoints respond and proves nothing about whether an agent can actually discover a vendor, reason about its capabilities, and complete a task under delegated authority.

This is also the concrete blocker in the design-partner motion. `docs/DESIGN_PARTNER_OUTREACH.md` defines success for the first session as "a real external agent completing the workflow against staging." Without a runtime, every such session depends on the partner bringing their own agent and wiring it up inside thirty minutes.

## Decision

Ship an Agent Runtime that pursues one goal to a stop, and give it no privileged access.

The runtime holds no database handle and no Vendor Connection credential. It discovers, registers, and invokes over the same public HTTPS surface an outside agent would use, authenticating with a short-lived delegated credential it registers for itself. A completed Agent Run is therefore evidence that the published contract works, not evidence that some internal path works.

Capability admission fails closed. `read_only` is invocable; `reversible` only when the run explicitly allows writes; `prohibited` never; an unrecognised policy is withheld rather than admitted, so extending the policy enum cannot silently widen what an agent may reach.

`approval_required` capabilities are declared to the model but gated. The model should be able to see that such a capability exists and reach for one; what it must never do is grant its own approval. Reaching for one stops the run and the call never leaves the runtime.

Every run is bounded by steps, invocations, and wall-clock time, and every exit carries a named halt reason.

## Consequences

- Agent Access can demonstrate its own thesis end to end in one command, which is the precondition for the thirty-minute design-partner session, not a substitute for having a design partner.
- The runtime depends on the Anthropic API and a new `ANTHROPIC_API_KEY`. A deployment without that key serves every existing surface unchanged and refuses only to start a run.
- Being its own first customer means a defect in the published surface now breaks a first-party feature, which is the intended pressure.
- Approval workflow is deliberately deferred. A gated run halts and records what was requested; granting the approval and resuming is a later decision.
- Runs execute inside the request that starts them. Queueing, resumption after a halt, and streaming progress are deferred until a partner needs them.
- A refusal from the model ends the run and is recorded as such. Server-side refusal fallbacks were considered and declined: silently re-running on a different model would leave an Agent Run whose recorded `model` is not the model that produced the evidence, which is the one property this product cannot trade away.
