import OpenAI from "openai";

import { ModelProviderError, type AgentTurn, type ModelProvider, type ModelSession } from "../provider";

type ChatClient = {
  chat: {
    completions: {
      create(params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.Chat.ChatCompletion>;
    };
  };
};

/**
 * Any endpoint that speaks OpenAI chat-completions with tool calling.
 *
 * Verified shapes this covers: Groq (`https://api.groq.com/openai/v1`),
 * GitHub Models (`https://models.github.ai/inference`), OpenRouter
 * (`https://openrouter.ai/api/v1`), and Gemini's compatibility endpoint
 * (`https://generativelanguage.googleapis.com/v1beta/openai/`). Several of
 * these have free tiers, which is the point: proving the runtime works should
 * not require a paid account.
 */
export function openAiCompatibleProvider(options: {
  client: ChatClient;
  model: string;
  /** Label recorded on the run - use the vendor, not "openai", so the trail is honest. */
  id?: string;
}): ModelProvider {
  return {
    id: options.id ?? "openai-compatible",
    model: options.model,
    start({ system, tools }) {
      const toolParams: OpenAI.Chat.ChatCompletionTool[] = tools.map((tool) => ({
        type: "function",
        function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
      }));
      const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [{ role: "system", content: system }];

      const session: ModelSession = {
        async next(input) {
          if ("goal" in input) {
            messages.push({ role: "user", content: input.goal });
          } else {
            // OpenAI wants one `tool` message per call, each keyed by id, and
            // every pending call must be answered or the next turn 400s.
            for (const result of input.results) {
              messages.push({ role: "tool", tool_call_id: result.toolCallId, content: result.content });
            }
          }

          const response = await options.client.chat.completions.create({
            model: options.model,
            messages,
            tools: toolParams,
            tool_choice: "auto",
            max_completion_tokens: 8000,
          });

          const choice = response.choices[0];
          if (!choice) throw new ModelProviderError("Model returned no choices");

          const usage = {
            inputTokens: response.usage?.prompt_tokens ?? 0,
            outputTokens: response.usage?.completion_tokens ?? 0,
          };

          if (choice.finish_reason === "content_filter") {
            return {
              stop: "refusal",
              text: "",
              toolCalls: [],
              refusal: { category: "content_filter", explanation: null },
              usage,
            } satisfies AgentTurn;
          }

          const message = choice.message;
          // Some providers surface a declined turn as a `refusal` field rather
          // than a finish_reason, so check both before trusting the content.
          if (typeof message.refusal === "string" && message.refusal) {
            return {
              stop: "refusal",
              text: "",
              toolCalls: [],
              refusal: { category: null, explanation: message.refusal },
              usage,
            } satisfies AgentTurn;
          }

          messages.push(message);
          const text = (message.content ?? "").trim();
          const rawCalls = message.tool_calls ?? [];

          if (!rawCalls.length) {
            return { stop: "answer", text, toolCalls: [], usage } satisfies AgentTurn;
          }

          const toolCalls = rawCalls.flatMap((call) => {
            if (call.type !== "function") return [];
            let parsed: Record<string, unknown> = {};
            try {
              // Arguments arrive as a JSON string, and escaping varies by
              // provider - always parse, never string-match.
              parsed = call.function.arguments ? (JSON.parse(call.function.arguments) as Record<string, unknown>) : {};
            } catch {
              parsed = {};
            }
            return [{ id: call.id, name: call.function.name, input: parsed }];
          });

          return { stop: "tool_use", text, toolCalls, usage } satisfies AgentTurn;
        },
      };

      return session;
    },
  };
}

export function createOpenAiCompatibleClient(options: { apiKey: string; baseUrl: string }) {
  return new OpenAI({ apiKey: options.apiKey, baseURL: options.baseUrl });
}
