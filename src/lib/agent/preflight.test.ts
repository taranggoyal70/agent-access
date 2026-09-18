import { describe, expect, it } from "vitest";

import { PREFLIGHT_TOOL_NAME, preflightToolCalling } from "./preflight";
import type { AgentToolDefinition, AgentTurn, ModelProvider } from "./provider";

function provider(turn: AgentTurn | (() => never), id = "groq", model = "tiny-1") {
  const offered: AgentToolDefinition[][] = [];
  const impl: ModelProvider = {
    id,
    model,
    start({ tools }) {
      offered.push(tools);
      return {
        async next() {
          if (typeof turn === "function") turn();
          return turn as AgentTurn;
        },
      };
    },
  };
  return { impl, offered };
}

const usage = { inputTokens: 1, outputTokens: 1 };

describe("preflightToolCalling", () => {
  it("passes when the model calls the probe tool", async () => {
    const { impl, offered } = provider({
      stop: "tool_use",
      text: "",
      toolCalls: [{ id: "c1", name: PREFLIGHT_TOOL_NAME, input: { token: "ready" } }],
      usage,
    });
    const result = await preflightToolCalling(impl);

    expect(result).toEqual({ ok: true, toolName: PREFLIGHT_TOOL_NAME });
    expect(offered[0].map((tool) => tool.name)).toEqual([PREFLIGHT_TOOL_NAME]);
  });

  it("fails when the model answers in text, which is the false-pass case", async () => {
    const { impl } = provider({ stop: "answer", text: "Sure, I called it.", toolCalls: [], usage });
    const result = await preflightToolCalling(impl);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("answered_in_text");
    // The message has to name the model, or an operator cannot act on it.
    expect(result.detail).toContain("groq/tiny-1");
    expect(result.detail).toContain("Tool calling is required");
  });

  it("fails when the model calls some other tool", async () => {
    const { impl } = provider({
      stop: "tool_use",
      text: "",
      toolCalls: [{ id: "c1", name: "something_else", input: {} }],
      usage,
    });
    const result = await preflightToolCalling(impl);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("wrong_tool");
    expect(result.detail).toContain("something_else");
  });

  it("reports a refusal separately from an unsuitable model", async () => {
    const { impl } = provider({
      stop: "refusal",
      text: "",
      toolCalls: [],
      refusal: { category: "cyber", explanation: "declined" },
      usage,
    });
    const result = await preflightToolCalling(impl);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("refused");
    expect(result.detail).toBe("declined");
  });

  it("turns a transport failure into a result rather than throwing", async () => {
    const { impl } = provider(() => {
      throw new Error("401 invalid api key");
    });
    const result = await preflightToolCalling(impl);

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("unreachable");
    expect(result.reason).toBe("error");
    expect(result.detail).toBe("401 invalid api key");
  });

  it("offers exactly one tool, with a required argument", async () => {
    const { impl, offered } = provider({
      stop: "tool_use",
      text: "",
      toolCalls: [{ id: "c1", name: PREFLIGHT_TOOL_NAME, input: { token: "ready" } }],
      usage,
    });
    await preflightToolCalling(impl);

    expect(offered[0]).toHaveLength(1);
    expect(offered[0][0].inputSchema).toMatchObject({ required: ["token"] });
  });
});
