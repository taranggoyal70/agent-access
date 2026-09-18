import type Anthropic from "@anthropic-ai/sdk";

export type CapabilityPolicy = "read_only" | "reversible" | "approval_required" | "prohibited";

/** One capability exactly as the public agent surface publishes it. */
export type PublishedCapability = {
  operation_id: string;
  summary: string;
  method: string;
  path: string;
  input_schema: Record<string, unknown>;
  output_schema?: Record<string, unknown>;
  policy: CapabilityPolicy;
  scope: string;
};

/**
 * Whether the runtime may call a capability on its own authority.
 *
 * `gated` capabilities are still declared to the model: it should know they
 * exist and be able to reach for one, because the run halting at that point is
 * the honest outcome. It must never be the agent that grants the approval.
 */
export type Admission = "invocable" | "gated" | "withheld";

export type AdmittedTool = {
  toolName: string;
  capability: PublishedCapability;
  admission: Exclude<Admission, "withheld">;
};

export type Toolset = {
  tools: Anthropic.Tool[];
  byToolName: Map<string, AdmittedTool>;
  withheld: { operation_id: string; policy: CapabilityPolicy; reason: string }[];
};

/**
 * Fail closed: a policy this function does not recognise is withheld rather
 * than admitted, so adding a policy to the schema cannot silently widen what
 * the agent is allowed to do.
 */
export function admit(capability: PublishedCapability, allowWrites: boolean): Admission {
  switch (capability.policy) {
    case "read_only":
      return "invocable";
    case "reversible":
      return allowWrites ? "invocable" : "withheld";
    case "approval_required":
      return "gated";
    default:
      return "withheld";
  }
}

function withheldReason(capability: PublishedCapability, allowWrites: boolean) {
  if (capability.policy === "reversible" && !allowWrites) return "run does not allow writes";
  if (capability.policy === "prohibited") return "capability is prohibited by policy";
  return `unrecognised policy '${capability.policy}'`;
}

/**
 * Anthropic tool names are constrained to `[a-zA-Z0-9_-]{1,64}`, but an
 * operationId comes from a vendor's OpenAPI document and can be anything.
 * Collisions are resolved by suffix so two distinct capabilities can never
 * share one tool name and be confused for each other at invocation time.
 */
export function toolNameFor(operationId: string, taken: Set<string> = new Set()) {
  const base = operationId.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/^_+/, "").slice(0, 60) || "capability";
  if (!taken.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix += 1) {
    const candidate = `${base.slice(0, 60 - String(suffix).length - 1)}_${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
  throw new Error(`Unable to derive a unique tool name for '${operationId}'`);
}

/**
 * An empty OpenAPI request body is a legitimate shape for a GET, but the
 * Messages API requires an object schema, so normalise rather than pass `{}`.
 */
function inputSchemaFor(capability: PublishedCapability): Anthropic.Tool["input_schema"] {
  const schema = capability.input_schema ?? {};
  if (schema.type === "object" && schema.properties) return schema as Anthropic.Tool["input_schema"];
  return { type: "object", properties: {}, additionalProperties: false };
}

function describe(capability: PublishedCapability, admission: Exclude<Admission, "withheld">) {
  const lines = [
    capability.summary,
    `${capability.method} ${capability.path} (scope: ${capability.scope}, policy: ${capability.policy})`,
  ];
  if (admission === "gated") {
    lines.push(
      "This capability requires human approval. Calling it will stop the run and hand the decision to a person. Only reach for it when the goal genuinely cannot be met with the other capabilities.",
    );
  }
  return lines.join("\n");
}

export function buildToolset(capabilities: PublishedCapability[], options: { allowWrites: boolean }): Toolset {
  const tools: Anthropic.Tool[] = [];
  const byToolName = new Map<string, AdmittedTool>();
  const withheld: Toolset["withheld"] = [];
  const taken = new Set<string>();

  for (const capability of capabilities) {
    const admission = admit(capability, options.allowWrites);
    if (admission === "withheld") {
      withheld.push({
        operation_id: capability.operation_id,
        policy: capability.policy,
        reason: withheldReason(capability, options.allowWrites),
      });
      continue;
    }
    const toolName = toolNameFor(capability.operation_id, taken);
    taken.add(toolName);
    byToolName.set(toolName, { toolName, capability, admission });
    tools.push({
      name: toolName,
      description: describe(capability, admission),
      input_schema: inputSchemaFor(capability),
    });
  }

  return { tools, byToolName, withheld };
}
