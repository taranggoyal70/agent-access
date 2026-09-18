import Anthropic from "@anthropic-ai/sdk";

import { ModelProviderError, type ModelProvider } from "../provider";
import { DEFAULT_ANTHROPIC_MODEL, anthropicProvider } from "./anthropic";
import { createOpenAiCompatibleClient, openAiCompatibleProvider } from "./openai-compatible";

/**
 * Endpoints that speak OpenAI chat-completions, keyed by the name you put in
 * `AGENT_MODEL_PROVIDER`. Several have a free tier, so the runtime can be
 * proven end to end without a paid account.
 */
export const OPENAI_COMPATIBLE_PRESETS: Record<string, { baseUrl: string; note: string }> = {
  groq: { baseUrl: "https://api.groq.com/openai/v1", note: "free tier, rate limited" },
  "github-models": { baseUrl: "https://models.github.ai/inference", note: "free with a GitHub account, rate limited" },
  openrouter: { baseUrl: "https://openrouter.ai/api/v1", note: "some models are free" },
  gemini: { baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/", note: "free tier via AI Studio" },
};

export const PROVIDER_NAMES = ["anthropic", ...Object.keys(OPENAI_COMPATIBLE_PRESETS), "openai-compatible"] as const;

function required(name: string, hint: string) {
  const value = process.env[name];
  if (!value) throw new ModelProviderError(`${name} is not configured. ${hint}`);
  return value;
}

/**
 * Builds the provider from the environment, failing closed.
 *
 * An unknown provider name is an error rather than a silent fall back to the
 * default: a run recorded as `anthropic/claude-opus-5` that actually came from
 * somewhere else would corrupt the one thing this product sells, which is
 * knowing exactly what produced a receipt.
 */
export function resolveProvider(): ModelProvider {
  const name = (process.env.AGENT_MODEL_PROVIDER ?? "anthropic").trim().toLowerCase();

  if (name === "anthropic") {
    const apiKey = required("ANTHROPIC_API_KEY", "Create one at console.anthropic.com; a Claude Pro subscription does not include API access.");
    return anthropicProvider({
      client: new Anthropic({ apiKey }),
      model: process.env.AGENT_MODEL?.trim() || DEFAULT_ANTHROPIC_MODEL,
    });
  }

  const preset = OPENAI_COMPATIBLE_PRESETS[name];
  if (!preset && name !== "openai-compatible") {
    throw new ModelProviderError(`Unknown AGENT_MODEL_PROVIDER '${name}'. Expected one of: ${PROVIDER_NAMES.join(", ")}.`);
  }

  const baseUrl = preset?.baseUrl ?? required("AGENT_MODEL_BASE_URL", "Set the OpenAI-compatible endpoint for this provider.");
  const apiKey = required("AGENT_MODEL_API_KEY", `Set the API key for '${name}'.`);
  const model = required("AGENT_MODEL", `Set the model id to use on '${name}', for example a tool-calling capable model.`);

  return openAiCompatibleProvider({
    client: createOpenAiCompatibleClient({ apiKey, baseUrl }),
    model,
    id: name === "openai-compatible" ? new URL(baseUrl).hostname : name,
  });
}

export { anthropicProvider, openAiCompatibleProvider, createOpenAiCompatibleClient, DEFAULT_ANTHROPIC_MODEL };
