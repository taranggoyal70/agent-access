import type Anthropic from "@anthropic-ai/sdk";
import type OpenAI from "openai";
import { afterEach, describe, expect, it } from "vitest";

import { ModelProviderError } from "../provider";
import { anthropicProvider } from "./anthropic";
import { openAiCompatibleProvider } from "./openai-compatible";
import { resolveProvider } from "./index";

const TOOLS = [
  { name: "list_projects", description: "List projects", inputSchema: { type: "object", properties: {}, additionalProperties: false } },
];

// ---------------------------------------------------------------- anthropic

function anthropicStub(script: Partial<Anthropic.Message>[]) {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let turn = 0;
  const client = {
    messages: {
      async create(params: Anthropic.MessageCreateParamsNonStreaming) {
        sent.push(structuredClone(params));
        const next = script[Math.min(turn, script.length - 1)];
        turn += 1;
        return { usage: { input_tokens: 7, output_tokens: 3 }, content: [], stop_reason: "end_turn", ...next } as Anthropic.Message;
      },
    },
  };
  return { client, sent };
}

const aText = (t: string) => ({ type: "text", text: t, citations: null }) as Anthropic.ContentBlock;
const aToolUse = (id: string, name: string) => ({ type: "tool_use", id, name, input: { a: 1 } }) as Anthropic.ContentBlock;

describe("anthropicProvider", () => {
  it("maps tools into the Messages API shape", async () => {
    const { client, sent } = anthropicStub([{ content: [aText("hi")], stop_reason: "end_turn" }]);
    await anthropicProvider({ client }).start({ system: "sys", tools: TOOLS }).next({ goal: "go" });

    expect(sent[0].tools).toEqual([{ name: "list_projects", description: "List projects", input_schema: TOOLS[0].inputSchema }]);
    expect(sent[0].system).toBe("sys");
  });

  it("reports an answer turn", async () => {
    const { client } = anthropicStub([{ content: [aText("done")], stop_reason: "end_turn" }]);
    const turn = await anthropicProvider({ client }).start({ system: "s", tools: TOOLS }).next({ goal: "go" });

    expect(turn.stop).toBe("answer");
    expect(turn.text).toBe("done");
    expect(turn.usage).toEqual({ inputTokens: 7, outputTokens: 3 });
  });

  it("reports a tool_use turn with parsed input", async () => {
    const { client } = anthropicStub([{ content: [aToolUse("tu_1", "list_projects")], stop_reason: "tool_use" }]);
    const turn = await anthropicProvider({ client }).start({ system: "s", tools: TOOLS }).next({ goal: "go" });

    expect(turn.stop).toBe("tool_use");
    expect(turn.toolCalls).toEqual([{ id: "tu_1", name: "list_projects", input: { a: 1 } }]);
  });

  it("reports a refusal without touching content", async () => {
    const { client } = anthropicStub([
      { content: [], stop_reason: "refusal", stop_details: { type: "refusal", category: "cyber", explanation: "no" } as Anthropic.Message["stop_details"] },
    ]);
    const turn = await anthropicProvider({ client }).start({ system: "s", tools: TOOLS }).next({ goal: "go" });

    expect(turn.stop).toBe("refusal");
    expect(turn.refusal).toEqual({ category: "cyber", explanation: "no" });
  });

  it("echoes the assistant content back so thinking blocks survive the next turn", async () => {
    const { client, sent } = anthropicStub([
      { content: [aToolUse("tu_1", "list_projects")], stop_reason: "tool_use" },
      { content: [aText("done")], stop_reason: "end_turn" },
    ]);
    const session = anthropicProvider({ client }).start({ system: "s", tools: TOOLS });
    await session.next({ goal: "go" });
    await session.next({ results: [{ toolCallId: "tu_1", content: "[]", isError: false }] });

    expect(sent[1].messages[1]).toMatchObject({ role: "assistant" });
    expect(Array.isArray(sent[1].messages[1].content)).toBe(true);
  });

  it("returns every tool result in a single user message", async () => {
    const { client, sent } = anthropicStub([
      { content: [aToolUse("tu_1", "list_projects")], stop_reason: "tool_use" },
      { content: [aText("done")], stop_reason: "end_turn" },
    ]);
    const session = anthropicProvider({ client }).start({ system: "s", tools: TOOLS });
    await session.next({ goal: "go" });
    await session.next({
      results: [
        { toolCallId: "tu_1", content: "[]", isError: false },
        { toolCallId: "tu_2", content: "boom", isError: true },
      ],
    });

    const last = sent[1].messages.at(-1);
    expect(last?.role).toBe("user");
    expect(Array.isArray(last?.content) && last.content).toHaveLength(2);
  });
});

// -------------------------------------------------------- openai-compatible

function openAiStub(script: Partial<OpenAI.Chat.ChatCompletion.Choice>[]) {
  const sent: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming[] = [];
  let turn = 0;
  const client = {
    chat: {
      completions: {
        async create(params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming) {
          sent.push(structuredClone(params));
          const next = script[Math.min(turn, script.length - 1)];
          turn += 1;
          return {
            choices: [{ index: 0, finish_reason: "stop", logprobs: null, message: assistant({ content: "" }), ...next }],
            usage: { prompt_tokens: 11, completion_tokens: 4, total_tokens: 15 },
          } as OpenAI.Chat.ChatCompletion;
        },
      },
    },
  };
  return { client, sent };
}

/** ChatCompletionMessage requires `refusal`, so fill it rather than repeat it everywhere. */
const assistant = (over: Partial<OpenAI.Chat.ChatCompletionMessage>): OpenAI.Chat.ChatCompletionMessage =>
  ({ role: "assistant", content: null, refusal: null, ...over }) as OpenAI.Chat.ChatCompletionMessage;

const oaiCall = (id: string, name: string, args: string) => ({
  id,
  type: "function" as const,
  function: { name, arguments: args },
});

describe("openAiCompatibleProvider", () => {
  const make = (client: Parameters<typeof openAiCompatibleProvider>[0]["client"]) =>
    openAiCompatibleProvider({ client, model: "llama-3.3-70b", id: "groq" });

  it("maps tools into the function-calling shape and puts the system prompt first", async () => {
    const { client, sent } = openAiStub([{ message: assistant({ content: "hi" }) }]);
    await make(client).start({ system: "sys", tools: TOOLS }).next({ goal: "go" });

    expect(sent[0].tools).toEqual([{ type: "function", function: { name: "list_projects", description: "List projects", parameters: TOOLS[0].inputSchema } }]);
    expect(sent[0].tool_choice).toBe("auto");
    expect(sent[0].messages[0]).toEqual({ role: "system", content: "sys" });
  });

  it("reports an answer turn when no tool calls come back", async () => {
    const { client } = openAiStub([{ message: assistant({ content: " done " }) }]);
    const turn = await make(client).start({ system: "s", tools: TOOLS }).next({ goal: "go" });

    expect(turn.stop).toBe("answer");
    expect(turn.text).toBe("done");
    expect(turn.usage).toEqual({ inputTokens: 11, outputTokens: 4 });
  });

  it("parses JSON arguments rather than string-matching them", async () => {
    const { client } = openAiStub([
      { finish_reason: "tool_calls", message: assistant({ content: null, tool_calls: [oaiCall("c1", "list_projects", '{"limit":5,"q":"a\\/b"}')] }) },
    ]);
    const turn = await make(client).start({ system: "s", tools: TOOLS }).next({ goal: "go" });

    expect(turn.stop).toBe("tool_use");
    expect(turn.toolCalls).toEqual([{ id: "c1", name: "list_projects", input: { limit: 5, q: "a/b" } }]);
  });

  it("survives malformed arguments instead of throwing mid-run", async () => {
    const { client } = openAiStub([
      { finish_reason: "tool_calls", message: assistant({ content: null, tool_calls: [oaiCall("c1", "list_projects", "{not json")] }) },
    ]);
    const turn = await make(client).start({ system: "s", tools: TOOLS }).next({ goal: "go" });

    expect(turn.toolCalls).toEqual([{ id: "c1", name: "list_projects", input: {} }]);
  });

  it("sends one tool message per result, keyed by call id", async () => {
    const { client, sent } = openAiStub([
      { finish_reason: "tool_calls", message: assistant({ content: null, tool_calls: [oaiCall("c1", "list_projects", "{}")] }) },
      { message: assistant({ content: "done" }) },
    ]);
    const session = make(client).start({ system: "s", tools: TOOLS });
    await session.next({ goal: "go" });
    await session.next({
      results: [
        { toolCallId: "c1", content: "[]", isError: false },
        { toolCallId: "c2", content: "boom", isError: true },
      ],
    });

    const tail = sent[1].messages.slice(-2);
    expect(tail).toEqual([
      { role: "tool", tool_call_id: "c1", content: "[]" },
      { role: "tool", tool_call_id: "c2", content: "boom" },
    ]);
  });

  it("treats a content filter as a refusal", async () => {
    const { client } = openAiStub([{ finish_reason: "content_filter", message: assistant({ content: null }) }]);
    const turn = await make(client).start({ system: "s", tools: TOOLS }).next({ goal: "go" });

    expect(turn.stop).toBe("refusal");
    expect(turn.refusal?.category).toBe("content_filter");
  });

  it("treats a refusal field as a refusal even when the finish reason is stop", async () => {
    const { client } = openAiStub([{ message: assistant({ content: null, refusal: "I cannot help" }) }]);
    const turn = await make(client).start({ system: "s", tools: TOOLS }).next({ goal: "go" });

    expect(turn.stop).toBe("refusal");
    expect(turn.refusal?.explanation).toBe("I cannot help");
  });

  it("records the vendor, not a generic label", async () => {
    const { client } = openAiStub([{ message: assistant({ content: "hi" }) }]);
    expect(make(client).id).toBe("groq");
  });
});

// ------------------------------------------------------------ env resolution

describe("resolveProvider", () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it("defaults to Anthropic and names the missing key", () => {
    delete process.env.AGENT_MODEL_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => resolveProvider()).toThrow(/ANTHROPIC_API_KEY is not configured/);
  });

  it("explains that a Pro subscription is not API access", () => {
    delete process.env.AGENT_MODEL_PROVIDER;
    delete process.env.ANTHROPIC_API_KEY;
    expect(() => resolveProvider()).toThrow(/does not include API access/);
  });

  it("rejects an unknown provider rather than falling back", () => {
    process.env.AGENT_MODEL_PROVIDER = "totally-made-up";
    expect(() => resolveProvider()).toThrow(ModelProviderError);
    expect(() => resolveProvider()).toThrow(/Unknown AGENT_MODEL_PROVIDER/);
  });

  it("requires a model id for an OpenAI-compatible preset", () => {
    process.env.AGENT_MODEL_PROVIDER = "groq";
    process.env.AGENT_MODEL_API_KEY = "k";
    delete process.env.AGENT_MODEL;
    expect(() => resolveProvider()).toThrow(/AGENT_MODEL is not configured/);
  });

  it("builds a preset provider and labels it by vendor", () => {
    process.env.AGENT_MODEL_PROVIDER = "groq";
    process.env.AGENT_MODEL_API_KEY = "k";
    process.env.AGENT_MODEL = "llama-3.3-70b-versatile";
    const provider = resolveProvider();
    expect(provider.id).toBe("groq");
    expect(provider.model).toBe("llama-3.3-70b-versatile");
  });

  it("requires a base url for a custom endpoint", () => {
    process.env.AGENT_MODEL_PROVIDER = "openai-compatible";
    process.env.AGENT_MODEL_API_KEY = "k";
    process.env.AGENT_MODEL = "m";
    delete process.env.AGENT_MODEL_BASE_URL;
    expect(() => resolveProvider()).toThrow(/AGENT_MODEL_BASE_URL is not configured/);
  });
});
