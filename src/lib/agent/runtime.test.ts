import { describe, expect, it } from "vitest";

import { PREFLIGHT_TOOL_NAME } from "./preflight";
import { runAgent } from "./runtime";
import type { AgentToolDefinition, AgentToolResult, AgentTurn, ModelProvider } from "./provider";
import { AgentSurfaceClient } from "./surface-client";
import type { PublishedCapability } from "./tools";

const CAPABILITIES: PublishedCapability[] = [
  { operation_id: "list_projects", summary: "List projects", method: "GET", path: "/projects", input_schema: {}, policy: "read_only", scope: "projects:read" },
  { operation_id: "create_project", summary: "Create a project", method: "POST", path: "/projects", input_schema: {}, policy: "reversible", scope: "projects:write" },
  { operation_id: "invite_member", summary: "Invite a member", method: "POST", path: "/projects/{id}/members", input_schema: {}, policy: "approval_required", scope: "projects:write" },
];

/** A surface backed by the real client, so these tests exercise its wire format too. */
function surface(options: { invoke?: (operationId: string) => { status: number; body: unknown } } = {}) {
  const invocations: { operationId: string; idempotencyKey: string }[] = [];
  const registrations: string[] = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/capabilities")) return Response.json({ capabilities: CAPABILITIES });
    if (url.endsWith("/accounts")) {
      registrations.push(url);
      return Response.json({ agent_account_id: "aa_1", delegation_id: "dl_1", capabilities: [], credential: "aa_sbx_x", expires_at: "2026-01-01" }, { status: 201 });
    }
    const operationId = decodeURIComponent(url.split("/invoke/")[1]);
    const headers = init?.headers as Record<string, string>;
    invocations.push({ operationId, idempotencyKey: headers["idempotency-key"] });
    const { status, body } = options.invoke?.(operationId) ?? {
      status: 200,
      body: { receipt_id: `rcp_${invocations.length}`, status_code: 200, signature: "sig", result: [{ id: "p_1" }] },
    };
    return Response.json(body, { status });
  }) as typeof fetch;
  return { client: new AgentSurfaceClient("https://example.test", "acme", impl), invocations, registrations };
}

const answer = (text: string): AgentTurn => ({ stop: "answer", text, toolCalls: [], usage: { inputTokens: 10, outputTokens: 5 } });
const callTool = (id: string, name: string, input: Record<string, unknown> = {}): AgentTurn => ({
  stop: "tool_use",
  text: "",
  toolCalls: [{ id, name, input }],
  usage: { inputTokens: 10, outputTokens: 5 },
});

/**
 * Replays a script of turns and records what it was offered and fed.
 *
 * It answers the preflight probe the way a tool-calling model would, so the
 * tests below exercise the same path a real provider takes. `preflight: false`
 * makes it behave like a model that cannot call tools.
 */
function stubProvider(script: AgentTurn[], options: { preflight?: boolean } = {}) {
  const offered: AgentToolDefinition[][] = [];
  const fed: AgentToolResult[][] = [];
  let turn = 0;
  const provider: ModelProvider = {
    id: "stub",
    model: "stub-1",
    start({ tools }) {
      const isProbe = tools.length === 1 && tools[0].name === PREFLIGHT_TOOL_NAME;
      if (!isProbe) offered.push(tools);
      return {
        async next(input) {
          if (isProbe) {
            return options.preflight === false
              ? answer("I have called the tool.")
              : callTool("probe", PREFLIGHT_TOOL_NAME, { token: "ready" });
          }
          if ("results" in input) fed.push(input.results);
          const next = script[Math.min(turn, script.length - 1)];
          turn += 1;
          return next;
        },
      };
    },
  };
  return { provider, offered, fed };
}

const base = { runId: "run_1", goal: "How many projects are there?", allowWrites: false };

describe("runAgent", () => {
  it("completes when the model answers without reaching for a tool", async () => {
    const { client } = surface();
    const { provider } = stubProvider([answer("There are 3.")]);
    const outcome = await runAgent({ provider, surface: client, ...base });

    expect(outcome.status).toBe("completed");
    expect(outcome.finalText).toBe("There are 3.");
    expect(outcome.invocationCount).toBe(0);
  });

  it("invokes a capability and records the receipt on the step", async () => {
    const { client, invocations } = surface();
    const { provider } = stubProvider([callTool("t1", "list_projects"), answer("There is 1 project.")]);
    const outcome = await runAgent({ provider, surface: client, ...base });

    expect(outcome.status).toBe("completed");
    expect(invocations).toEqual([{ operationId: "list_projects", idempotencyKey: "run_1:t1" }]);
    expect(outcome.steps.find((step) => step.kind === "invocation")).toMatchObject({
      operationId: "list_projects",
      receiptId: "rcp_1",
      statusCode: 200,
    });
  });

  it("records which provider and model produced the run", async () => {
    const { client } = surface();
    const { provider } = stubProvider([answer("ok")]);
    const outcome = await runAgent({ provider, surface: client, ...base });

    expect(outcome.steps[0].detail).toMatchObject({ provider: "stub", model: "stub-1" });
  });

  it("halts without invoking when the model reaches for a gated capability", async () => {
    const { client, invocations } = surface();
    const { provider } = stubProvider([callTool("t1", "invite_member", { email: "x@y.z" })]);
    const outcome = await runAgent({ provider, surface: client, ...base, allowWrites: true });

    expect(outcome.status).toBe("halted");
    expect(outcome.haltReason).toBe("approval_required");
    // The point of the gate: the call never reached the vendor.
    expect(invocations).toEqual([]);
    expect(outcome.steps.at(-1)).toMatchObject({ kind: "halt", operationId: "invite_member", policy: "approval_required" });
  });

  it("stops at the step budget", async () => {
    const { client } = surface();
    const { provider } = stubProvider([callTool("t1", "list_projects")]);
    const outcome = await runAgent({ provider, surface: client, ...base, bounds: { maxSteps: 3 } });

    expect(outcome.haltReason).toBe("step_limit");
    expect(outcome.steps.filter((step) => step.kind === "invocation")).toHaveLength(3);
  });

  it("stops at the invocation budget even with steps left", async () => {
    const { client, invocations } = surface();
    const { provider } = stubProvider([callTool("t1", "list_projects")]);
    const outcome = await runAgent({ provider, surface: client, ...base, bounds: { maxSteps: 10, maxInvocations: 2 } });

    expect(outcome.haltReason).toBe("invocation_limit");
    expect(invocations).toHaveLength(2);
  });

  it("stops at the wall-clock deadline", async () => {
    const { client } = surface();
    const { provider } = stubProvider([callTool("t1", "list_projects")]);
    let clock = 0;
    const outcome = await runAgent({ provider, surface: client, ...base, bounds: { deadlineMs: 5_000 }, now: () => (clock += 4_000) });

    expect(outcome.haltReason).toBe("time_limit");
  });

  it("records a refusal instead of reading the refused content", async () => {
    const { client } = surface();
    const { provider } = stubProvider([
      { stop: "refusal", text: "", toolCalls: [], refusal: { category: "cyber", explanation: "declined" }, usage: { inputTokens: 1, outputTokens: 0 } },
    ]);
    const outcome = await runAgent({ provider, surface: client, ...base });

    expect(outcome.status).toBe("failed");
    expect(outcome.steps.at(-1)).toMatchObject({ kind: "refusal", detail: { category: "cyber" } });
  });

  it("hands a policy denial back to the model as a tool error and keeps going", async () => {
    const { client } = surface({ invoke: () => ({ status: 403, body: { error: "Capability is prohibited by policy" } }) });
    const { provider, fed } = stubProvider([callTool("t1", "list_projects"), answer("I could not read projects.")]);
    const outcome = await runAgent({ provider, surface: client, ...base });

    expect(outcome.status).toBe("completed");
    expect(outcome.steps.find((step) => step.kind === "invocation")).toMatchObject({ statusCode: 403 });
    expect(fed[0][0]).toMatchObject({ toolCallId: "t1", isError: true });
    expect(fed[0][0].content).toContain("prohibited by policy");
  });

  it("withholds a reversible capability from a read-only run, and admits it when writes are allowed", async () => {
    const { client } = surface();
    const readOnly = stubProvider([answer("ok")]);
    await runAgent({ provider: readOnly.provider, surface: client, ...base, allowWrites: false });
    // create_project is absent; invite_member is present but gated, because the
    // model should be able to see the capability it is not allowed to trigger.
    expect(readOnly.offered[0].map((tool) => tool.name)).toEqual(["list_projects", "invite_member"]);

    const writable = stubProvider([answer("ok")]);
    await runAgent({ provider: writable.provider, surface: client, ...base, allowWrites: true });
    expect(writable.offered[0].map((tool) => tool.name)).toEqual(["list_projects", "create_project", "invite_member"]);
  });

  it("records why each capability was withheld on the opening step", async () => {
    const { client } = surface();
    const { provider } = stubProvider([answer("ok")]);
    const outcome = await runAgent({ provider, surface: client, ...base });

    expect(outcome.steps[0].detail.withheld).toEqual([
      { operation_id: "create_project", policy: "reversible", reason: "run does not allow writes" },
    ]);
  });

  it("refuses to run a model that cannot call tools, instead of recording a false pass", async () => {
    const { client, registrations, invocations } = surface();
    // Answers in text when asked to call a tool - the exact shape that would
    // otherwise produce a `completed` run having proved nothing.
    const { provider } = stubProvider([answer("There are 3 projects.")], { preflight: false });
    const outcome = await runAgent({ provider, surface: client, ...base });

    expect(outcome.status).toBe("failed");
    expect(outcome.haltReason).toBe("model_unsuitable");
    expect(outcome.finalText).toBeNull();
    // Nothing was registered and nothing was invoked: it stopped before
    // touching the surface at all.
    expect(registrations).toEqual([]);
    expect(invocations).toEqual([]);
  });

  it("explains an unsuitable model in terms an operator can act on", async () => {
    const { client } = surface();
    const { provider } = stubProvider([answer("done")], { preflight: false });
    const outcome = await runAgent({ provider, surface: client, ...base });

    const step = outcome.steps.find((entry) => entry.kind === "preflight");
    expect(step?.detail).toMatchObject({ ok: false, reason: "answered_in_text", provider: "stub", model: "stub-1" });
    expect(String(step?.detail.detail)).toContain("Tool calling is required");
  });

  it("records a passing preflight before it registers an agent account", async () => {
    const { client } = surface();
    const { provider } = stubProvider([answer("ok")]);
    const outcome = await runAgent({ provider, surface: client, ...base });

    const preflightIndex = outcome.steps.findIndex((entry) => entry.kind === "preflight");
    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(outcome.steps[preflightIndex].detail).toMatchObject({ ok: true });
    expect(outcome.status).toBe("completed");
  });

  it("skips the probe when the caller says the provider is known good", async () => {
    const { client } = surface();
    const { provider } = stubProvider([answer("ok")], { preflight: false });
    const outcome = await runAgent({ provider, surface: client, ...base, skipPreflight: true });

    expect(outcome.steps.some((entry) => entry.kind === "preflight")).toBe(false);
    expect(outcome.status).toBe("completed");
  });
});
