/**
 * The model port.
 *
 * Agent Access sells itself as the neutral layer between a vendor and any
 * external agent, so the runtime should not be welded to one model vendor.
 * Everything the loop needs from a model is behind this interface, and the
 * provider owns its own conversation history: Anthropic has to echo content
 * blocks back verbatim to preserve thinking, an OpenAI-compatible endpoint
 * needs `tool_calls` and matching `tool` messages. Neither leaks into the loop.
 */

export type AgentToolDefinition = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type AgentToolCall = {
  id: string;
  name: string;
  input: Record<string, unknown>;
};

export type AgentToolResult = {
  toolCallId: string;
  content: string;
  isError: boolean;
};

export type AgentTurn = {
  /** Why the model stopped. `refusal` carries no usable answer. */
  stop: "answer" | "tool_use" | "refusal";
  text: string;
  toolCalls: AgentToolCall[];
  refusal?: { category: string | null; explanation: string | null };
  usage: { inputTokens: number; outputTokens: number };
};

export type ModelSession = {
  /** First call carries the goal; every later call carries the previous turn's tool results. */
  next(input: { goal: string } | { results: AgentToolResult[] }): Promise<AgentTurn>;
};

export type ModelProvider = {
  /** Recorded on the run, so a receipt trail always names what produced it. */
  readonly id: string;
  readonly model: string;
  start(options: { system: string; tools: AgentToolDefinition[] }): ModelSession;
};

export class ModelProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelProviderError";
  }
}

/** `provider/model`, written to `agent_runs.model`. */
export function describeProvider(provider: ModelProvider) {
  return `${provider.id}/${provider.model}`;
}
