import Anthropic from "@anthropic-ai/sdk";

import type { AgentTurn, ModelProvider, ModelSession } from "../provider";

export const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5";

type MessagesClient = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message> };
};

function textFrom(content: Anthropic.ContentBlock[]) {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n")
    .trim();
}

export function anthropicProvider(options: { client: MessagesClient; model?: string }): ModelProvider {
  const model = options.model ?? DEFAULT_ANTHROPIC_MODEL;

  return {
    id: "anthropic",
    model,
    start({ system, tools }) {
      const toolParams: Anthropic.Tool[] = tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        input_schema: tool.inputSchema as Anthropic.Tool["input_schema"],
      }));
      const messages: Anthropic.MessageParam[] = [];

      const session: ModelSession = {
        async next(input) {
          if ("goal" in input) {
            messages.push({ role: "user", content: input.goal });
          } else {
            // Every result in one user message. Splitting them teaches the
            // model to stop issuing parallel tool calls.
            messages.push({
              role: "user",
              content: input.results.map((result) => ({
                type: "tool_result" as const,
                tool_use_id: result.toolCallId,
                is_error: result.isError,
                content: result.content,
              })),
            });
          }

          const response = await options.client.messages.create({
            model,
            max_tokens: 16000,
            system,
            thinking: { type: "adaptive" },
            tools: toolParams,
            messages,
          });

          const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };

          // Guard before reading content: a refused turn carries no answer.
          if (response.stop_reason === "refusal") {
            return {
              stop: "refusal",
              text: "",
              toolCalls: [],
              refusal: {
                category: response.stop_details?.category ?? null,
                explanation: response.stop_details?.explanation ?? null,
              },
              usage,
            } satisfies AgentTurn;
          }

          // Append the whole content array, not just the text: thinking blocks
          // must be echoed back unchanged on the next turn of the same model.
          messages.push({ role: "assistant", content: response.content });

          const text = textFrom(response.content);
          if (response.stop_reason !== "tool_use") {
            return { stop: "answer", text, toolCalls: [], usage } satisfies AgentTurn;
          }

          return {
            stop: "tool_use",
            text,
            toolCalls: response.content
              .filter((block): block is Anthropic.ToolUseBlock => block.type === "tool_use")
              .map((block) => ({ id: block.id, name: block.name, input: (block.input ?? {}) as Record<string, unknown> })),
            usage,
          } satisfies AgentTurn;
        },
      };

      return session;
    },
  };
}
