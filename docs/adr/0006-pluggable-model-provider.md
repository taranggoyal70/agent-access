# ADR 0006: Put the agent runtime behind a model port

- Status: Accepted
- Date: 2026-09-18
- Amends: [ADR 0005](0005-first-party-agent-runtime.md)

## Context

ADR 0005 shipped the runtime against the Anthropic SDK directly. Two things followed that were not obvious when it was written.

The first is positioning. Agent Access sells itself as the neutral layer between a SaaS Vendor and *any* external Agent Customer. A runtime welded to one model vendor quietly contradicts that, and a Champion evaluating the product is exactly the kind of reader who notices.

The second is access. The Anthropic API is billed separately from a Claude consumer subscription, so a developer holding a Claude Pro plan still cannot run the agent. Requiring a paid account to see the product work at all is a poor first experience for a design partner, and a worse one for an evaluator who has not yet decided the product is worth a purchase order.

## Decision

Everything the loop needs from a model sits behind a `ModelProvider` port, and the provider owns its own conversation history.

That last part is the load-bearing detail. Anthropic requires assistant content blocks to be echoed back verbatim so extended thinking survives the next turn; an OpenAI-compatible endpoint requires `tool_calls` on the assistant message and one matching `tool` message per result. Both constraints are real and neither belongs in the loop. The loop sees turns, tool calls, and tool results.

Two adapters ship: the Anthropic SDK, and any endpoint speaking OpenAI chat-completions with tool calling. The second covers Groq, GitHub Models, OpenRouter, and Gemini's compatibility endpoint by preset, and any other host via an explicit base URL. Several of those have a free tier.

Anthropic stays the default. Provider resolution fails closed: an unrecognised provider name is an error, never a fall back to the default.

## Consequences

- The runtime can be proven end to end on a free tier, so seeing it work no longer requires a purchase decision first.
- Every run records `provider/model`. A run labelled `anthropic/claude-opus-5` that was actually served elsewhere would corrupt the one property this product exists to guarantee, which is knowing exactly what produced a receipt. That is why unknown provider names fail rather than default.
- Model quality now varies by deployment. A free model that tool-calls poorly will produce worse runs, and the honest read of a bad run is the model, not the policy layer. The step log records enough to tell them apart.
- The chosen model **must** support tool calling. That is now enforced rather than assumed: a one-turn preflight probe runs before each run and fails it with `model_unsuitable` if the model answers in text instead of calling the probe tool. It stops before an Agent Account is registered, so an unsuitable model never reaches the surface. The cost is one small turn per run, which is the right trade against recording a `completed` run that proved nothing.
- `openai` is now a dependency alongside `@anthropic-ai/sdk`. Both are carried even when only one is configured.
- Anthropic-specific behaviour that has no portable equivalent stays behind the Anthropic adapter: adaptive thinking, and the structured `stop_details` on a refusal. The port models a refusal generically, so an OpenAI-compatible `content_filter` finish reason and a populated `refusal` field both map onto it.
