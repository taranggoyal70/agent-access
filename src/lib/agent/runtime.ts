import { preflightToolCalling } from "./preflight";
import type { AgentToolResult, ModelProvider } from "./provider";
import { AgentSurfaceClient, SurfaceError, idempotencyKeyFor, type InvocationReceipt } from "./surface-client";
import { buildToolset, type PublishedCapability } from "./tools";

export type HaltReason =
  | "step_limit"
  | "invocation_limit"
  | "time_limit"
  | "approval_required"
  | "upstream_error"
  | "model_error"
  | "model_unsuitable";

export type RunStep = {
  index: number;
  kind: "plan" | "preflight" | "invocation" | "refusal" | "halt";
  operationId?: string;
  idempotencyKey?: string;
  receiptId?: string;
  statusCode?: number;
  policy?: string;
  detail: Record<string, unknown>;
};

export type RunOutcome = {
  status: "completed" | "halted" | "failed";
  haltReason?: HaltReason;
  finalText: string | null;
  steps: RunStep[];
  agentAccountId: string | null;
  invocationCount: number;
  usage: { inputTokens: number; outputTokens: number };
};

export type RunBounds = {
  maxSteps: number;
  maxInvocations: number;
  deadlineMs: number;
};

export const DEFAULT_BOUNDS: RunBounds = { maxSteps: 8, maxInvocations: 12, deadlineMs: 120_000 };

const SYSTEM_PROMPT = `You are an external AI agent operating against a SaaS vendor through Agent Access.

Every tool you can see is a capability the vendor reviewed and published for external agents. You hold a short-lived delegated credential scoped to exactly these capabilities and nothing else. Each call you make produces a signed execution receipt that a human will read.

How to work:
- Use the tools to gather real evidence. Never state a result you did not observe in a tool result.
- If a tool returns an error, read it and adapt. A policy denial is a decision, not a transient fault: do not retry the same call hoping for a different answer.
- Some tools are marked as requiring human approval. Reaching for one stops the run and hands the decision to a person. Only do that when the goal genuinely cannot be met otherwise.
- When you have enough to answer, stop calling tools and give the answer. Say plainly what you could not determine.

Be concise. The reader wants the finding, not a narration of your process.`;

function resultPreview(receipt: InvocationReceipt) {
  const payload = receipt.result ?? receipt.response ?? {};
  const serialized = JSON.stringify(payload);
  // Receipts can carry a full upstream payload; the model needs the content,
  // not an unbounded transcript, and the untruncated body is on the receipt.
  return serialized.length > 8000 ? `${serialized.slice(0, 8000)}\n[truncated - full body is on receipt ${receipt.receipt_id}]` : serialized;
}

/**
 * Runs one goal to a stop, and returns what happened.
 *
 * Nothing here writes to the database and nothing here knows which model
 * vendor is answering: the caller persists the outcome, and the provider owns
 * its own conversation format. That keeps the loop testable against a stubbed
 * surface and a stubbed model, which is the only way the bound and gate
 * behaviour can be asserted rather than asserted-in-a-comment.
 */
export async function runAgent(options: {
  provider: ModelProvider;
  surface: AgentSurfaceClient;
  runId: string;
  goal: string;
  allowWrites: boolean;
  bounds?: Partial<RunBounds>;
  /** Skip the tool-calling probe. Only sensible when the provider is already known good. */
  skipPreflight?: boolean;
  now?: () => number;
}): Promise<RunOutcome> {
  const bounds = { ...DEFAULT_BOUNDS, ...options.bounds };
  const now = options.now ?? Date.now;
  const startedAt = now();
  const steps: RunStep[] = [];
  const usage = { inputTokens: 0, outputTokens: 0 };
  let invocationCount = 0;
  let agentAccountId: string | null = null;

  const record = (step: Omit<RunStep, "index">) => {
    steps.push({ index: steps.length, ...step });
  };

  const finish = (status: RunOutcome["status"], finalText: string | null, haltReason?: HaltReason): RunOutcome => ({
    status,
    haltReason,
    finalText,
    steps,
    agentAccountId,
    invocationCount,
    usage,
  });

  const capabilities: PublishedCapability[] = await options.surface.listCapabilities();
  const toolset = buildToolset(capabilities, { allowWrites: options.allowWrites });

  record({
    kind: "plan",
    detail: {
      phase: "toolset",
      provider: options.provider.id,
      model: options.provider.model,
      admitted: [...toolset.byToolName.values()].map((entry) => ({ operation_id: entry.capability.operation_id, admission: entry.admission })),
      withheld: toolset.withheld,
    },
  });

  if (!toolset.tools.length) {
    record({ kind: "halt", detail: { reason: "no capability is invocable under this run's policy" } });
    return finish("failed", null, "model_error");
  }

  if (!options.skipPreflight) {
    const preflight = await preflightToolCalling(options.provider);
    record({ kind: "preflight", detail: { ...preflight, provider: options.provider.id, model: options.provider.model } });
    if (!preflight.ok) {
      // Stop before registering an agent account. A model that cannot call
      // tools would otherwise answer from its own head and the run would be
      // recorded as completed while proving nothing.
      return finish("failed", null, preflight.reason === "refused" ? "model_error" : "model_unsuitable");
    }
  }

  const registration = await options.surface.register(
    `agent-run ${options.runId}`,
    [...toolset.byToolName.values()].map((entry) => entry.capability.operation_id),
  );
  agentAccountId = registration.agent_account_id;

  const session = options.provider.start({ system: SYSTEM_PROMPT, tools: toolset.tools });
  let pending: { goal: string } | { results: AgentToolResult[] } = { goal: options.goal };

  for (let step = 0; step < bounds.maxSteps; step += 1) {
    if (now() - startedAt > bounds.deadlineMs) {
      record({ kind: "halt", detail: { reason: "wall-clock deadline reached", elapsed_ms: now() - startedAt } });
      return finish("halted", null, "time_limit");
    }

    let turn;
    try {
      turn = await session.next(pending);
    } catch (error) {
      record({ kind: "halt", detail: { reason: error instanceof Error ? error.message : "model request failed" } });
      return finish("failed", null, "model_error");
    }

    usage.inputTokens += turn.usage.inputTokens;
    usage.outputTokens += turn.usage.outputTokens;

    if (turn.stop === "refusal") {
      record({
        kind: "refusal",
        detail: { category: turn.refusal?.category ?? null, explanation: turn.refusal?.explanation ?? null },
      });
      return finish("failed", null, "model_error");
    }

    if (turn.stop === "answer") {
      record({ kind: "plan", detail: { phase: "answer", text: turn.text } });
      return finish("completed", turn.text || null);
    }

    record({ kind: "plan", detail: { phase: "tool_use", text: turn.text, calls: turn.toolCalls.map((call) => call.name) } });

    const results: AgentToolResult[] = [];

    for (const call of turn.toolCalls) {
      const admitted = toolset.byToolName.get(call.name);
      if (!admitted) {
        results.push({ toolCallId: call.id, isError: true, content: `Unknown tool '${call.name}'.` });
        continue;
      }

      if (admitted.admission === "gated") {
        record({
          kind: "halt",
          operationId: admitted.capability.operation_id,
          policy: admitted.capability.policy,
          detail: { reason: "capability requires human approval", requested_input: call.input },
        });
        return finish("halted", turn.text || null, "approval_required");
      }

      if (invocationCount >= bounds.maxInvocations) {
        record({ kind: "halt", detail: { reason: "invocation budget exhausted", max_invocations: bounds.maxInvocations } });
        return finish("halted", turn.text || null, "invocation_limit");
      }

      const idempotencyKey = idempotencyKeyFor(options.runId, call.id);
      invocationCount += 1;

      try {
        const receipt = await options.surface.invoke({
          operationId: admitted.capability.operation_id,
          credential: registration.credential,
          body: call.input,
          idempotencyKey,
        });
        record({
          kind: "invocation",
          operationId: admitted.capability.operation_id,
          idempotencyKey,
          receiptId: receipt.receipt_id,
          statusCode: receipt.status_code,
          policy: admitted.capability.policy,
          detail: { replayed: receipt.replayed ?? false, signature: receipt.signature },
        });
        results.push({
          toolCallId: call.id,
          isError: receipt.status_code >= 400,
          content: resultPreview(receipt),
        });
      } catch (error) {
        const status = error instanceof SurfaceError ? error.status : 500;
        const message = error instanceof Error ? error.message : "Invocation failed";
        record({
          kind: "invocation",
          operationId: admitted.capability.operation_id,
          idempotencyKey,
          statusCode: status,
          policy: admitted.capability.policy,
          detail: { error: message },
        });
        // Hand the denial back as a tool error rather than ending the run: the
        // model can often reach the goal another way, and if it cannot, it
        // says so, which is a more useful outcome than a stack trace.
        results.push({ toolCallId: call.id, isError: true, content: `${status}: ${message}` });
      }
    }

    pending = { results };
  }

  record({ kind: "halt", detail: { reason: "step budget exhausted", max_steps: bounds.maxSteps } });
  return finish("halted", null, "step_limit");
}
