import type { AgentToolDefinition, ModelProvider } from "./provider";

export const PREFLIGHT_TOOL_NAME = "preflight_probe";

const PREFLIGHT_TOOL: AgentToolDefinition = {
  name: PREFLIGHT_TOOL_NAME,
  description: "Confirms the caller can receive tool calls. Call it once with token \"ready\".",
  inputSchema: {
    type: "object",
    properties: { token: { type: "string", description: "Always the string \"ready\"." } },
    required: ["token"],
    additionalProperties: false,
  },
};

const PREFLIGHT_SYSTEM = "You are being checked for tool-calling support. Follow the instruction exactly and do not explain yourself.";

const PREFLIGHT_GOAL = `Call the ${PREFLIGHT_TOOL_NAME} tool once, with token set to "ready". Do not reply with text.`;

export type PreflightResult =
  | { ok: true; toolName: string }
  | { ok: false; reason: "answered_in_text" | "wrong_tool" | "refused" | "error"; detail: string };

/**
 * Asks the model to make one tool call, and checks that it did.
 *
 * Without this, a model that cannot tool-call produces the worst possible
 * outcome: it answers the goal from its own head, invokes nothing, and the run
 * is recorded as `completed`. That reads as a pass while proving nothing about
 * the published surface. Better to fail the run and say why.
 *
 * Deliberately not a substitute for the real toolset - it probes the provider's
 * capability with one tiny turn, then gets out of the way.
 */
export async function preflightToolCalling(provider: ModelProvider): Promise<PreflightResult> {
  let turn;
  try {
    turn = await provider.start({ system: PREFLIGHT_SYSTEM, tools: [PREFLIGHT_TOOL] }).next({ goal: PREFLIGHT_GOAL });
  } catch (error) {
    return { ok: false, reason: "error", detail: error instanceof Error ? error.message : "preflight request failed" };
  }

  if (turn.stop === "refusal") {
    return { ok: false, reason: "refused", detail: turn.refusal?.explanation ?? "model refused the preflight probe" };
  }

  if (turn.stop !== "tool_use" || !turn.toolCalls.length) {
    return {
      ok: false,
      reason: "answered_in_text",
      detail: `${provider.id}/${provider.model} answered in text instead of calling a tool. Tool calling is required; pick a model that supports it.`,
    };
  }

  const called = turn.toolCalls[0];
  if (called.name !== PREFLIGHT_TOOL_NAME) {
    return {
      ok: false,
      reason: "wrong_tool",
      detail: `Expected a call to ${PREFLIGHT_TOOL_NAME} but got '${called.name}'.`,
    };
  }

  return { ok: true, toolName: called.name };
}
