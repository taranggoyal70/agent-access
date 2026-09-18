import type Anthropic from "@anthropic-ai/sdk";

import { AgentSurfaceClient, SurfaceError, idempotencyKeyFor, type InvocationReceipt } from "./surface-client";
import { buildToolset, type PublishedCapability } from "./tools";

export const AGENT_MODEL = "claude-opus-5";

export type HaltReason =
  | "step_limit"
  | "invocation_limit"
  | "time_limit"
  | "approval_required"
  | "upstream_error"
  | "model_error";

export type RunStep = {
  index: number;
  kind: "plan" | "invocation" | "refusal" | "halt";
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

/** The slice of the Anthropic client the loop uses, so tests can stub a model. */
export type MessagesClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

const SYSTEM_PROMPT = `You are an external AI agent operating against a SaaS vendor through Agent Access.

Every tool you can see is a capability the vendor reviewed and published for external agents. You hold a short-lived delegated credential scoped to exactly these capabilities and nothing else. Each call you make produces a signed execution receipt that a human will read.

How to work:
- Use the tools to gather real evidence. Never state a result you did not observe in a tool result.
- If a tool returns an error, read it and adapt. A policy denial is a decision, not a transient fault: do not retry the same call hoping for a different answer.
- Some tools are marked as requiring human approval. Reaching for one stops the run and hands the decision to a person. Only do that when the goal genuinely cannot be met otherwise.
- When you have enough to answer, stop calling tools and give the answer. Say plainly what you could not determine.

Be concise. The reader wants the finding, not a narration of your process.`;

function textFrom(content: Anthropic.ContentBlock[]) {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

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
 * Nothing here writes to the database: the caller persists the outcome. That
 * keeps the loop testable against a stubbed surface and a stubbed model, which
 * is the only way the bound and halt behaviour can be asserted rather than
 * asserted-in-a-comment.
 */
export async function runAgent(options: {
  anthropic: MessagesClient;
  surface: AgentSurfaceClient;
  runId: string;
  goal: string;
  allowWrites: boolean;
  bounds?: Partial<RunBounds>;
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
      admitted: [...toolset.byToolName.values()].map((entry) => ({ operation_id: entry.capability.operation_id, admission: entry.admission })),
      withheld: toolset.withheld,
    },
  });

  if (!toolset.tools.length) {
    record({ kind: "halt", detail: { reason: "no capability is invocable under this run's policy" } });
    return finish("failed", null, "model_error");
  }

  const registration = await options.surface.register(
    `agent-run ${options.runId}`,
    [...toolset.byToolName.values()].map((entry) => entry.capability.operation_id),
  );
  agentAccountId = registration.agent_account_id;

  const messages: Anthropic.MessageParam[] = [{ role: "user", content: options.goal }];

  for (let step = 0; step < bounds.maxSteps; step += 1) {
    if (now() - startedAt > bounds.deadlineMs) {
      record({ kind: "halt", detail: { reason: "wall-clock deadline reached", elapsed_ms: now() - startedAt } });
      return finish("halted", null, "time_limit");
    }

    let response: Anthropic.Message;
    try {
      response = await options.anthropic.messages.create({
        model: AGENT_MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT,
        thinking: { type: "adaptive" },
        tools: toolset.tools,
        messages,
      });
    } catch (error) {
      record({ kind: "halt", detail: { reason: error instanceof Error ? error.message : "model request failed" } });
      return finish("failed", null, "model_error");
    }

    usage.inputTokens += response.usage.input_tokens;
    usage.outputTokens += response.usage.output_tokens;

    // Guard before reading content: a refused turn carries no usable answer.
    if (response.stop_reason === "refusal") {
      record({
        kind: "refusal",
        detail: { category: response.stop_details?.category ?? null, explanation: response.stop_details?.explanation ?? null },
      });
      return finish("failed", null, "model_error");
    }

    const assistantText = textFrom(response.content);
    // Append the whole content array, not just the text: thinking blocks must
    // be echoed back unchanged on the next turn of the same model.
    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason !== "tool_use") {
      record({ kind: "plan", detail: { phase: "answer", stop_reason: response.stop_reason, text: assistantText } });
      return finish("completed", assistantText || null);
    }

    const toolUses = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use");
    record({ kind: "plan", detail: { phase: "tool_use", text: assistantText, calls: toolUses.map((call) => call.name) } });

    const results: Anthropic.ToolResultBlockParam[] = [];

    for (const call of toolUses) {
      const admitted = toolset.byToolName.get(call.name);
      if (!admitted) {
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `Unknown tool '${call.name}'.` });
        continue;
      }

      if (admitted.admission === "gated") {
        record({
          kind: "halt",
          operationId: admitted.capability.operation_id,
          policy: admitted.capability.policy,
          detail: { reason: "capability requires human approval", requested_input: call.input },
        });
        return finish("halted", assistantText || null, "approval_required");
      }

      if (invocationCount >= bounds.maxInvocations) {
        record({ kind: "halt", detail: { reason: "invocation budget exhausted", max_invocations: bounds.maxInvocations } });
        return finish("halted", assistantText || null, "invocation_limit");
      }

      const idempotencyKey = idempotencyKeyFor(options.runId, call.id);
      invocationCount += 1;

      try {
        const receipt = await options.surface.invoke({
          operationId: admitted.capability.operation_id,
          credential: registration.credential,
          body: (call.input ?? {}) as Record<string, unknown>,
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
          type: "tool_result",
          tool_use_id: call.id,
          is_error: receipt.status_code >= 400,
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
        results.push({ type: "tool_result", tool_use_id: call.id, is_error: true, content: `${status}: ${message}` });
      }
    }

    // One user message carrying every result. Splitting them teaches the model
    // to stop issuing parallel calls.
    messages.push({ role: "user", content: results });
  }

  record({ kind: "halt", detail: { reason: "step budget exhausted", max_steps: bounds.maxSteps } });
  return finish("halted", null, "step_limit");
}
