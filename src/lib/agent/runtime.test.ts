import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { runAgent, type MessagesClient } from "./runtime";
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
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/capabilities")) {
      return Response.json({ capabilities: CAPABILITIES });
    }
    if (url.endsWith("/accounts")) {
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
  return { client: new AgentSurfaceClient("https://example.test", "acme", impl), invocations };
}

function message(content: Anthropic.ContentBlock[], stopReason: Anthropic.Message["stop_reason"]): Anthropic.Message {
  return {
    id: "msg_1",
    type: "message",
    role: "assistant",
    model: "claude-opus-5",
    content,
    stop_reason: stopReason,
    stop_sequence: null,
    usage: { input_tokens: 10, output_tokens: 5 },
  } as Anthropic.Message;
}

const text = (value: string) => ({ type: "text", text: value, citations: null }) as Anthropic.ContentBlock;
const toolUse = (id: string, name: string, input: Record<string, unknown> = {}) =>
  ({ type: "tool_use", id, name, input }) as Anthropic.ContentBlock;

/** Replays a script of model turns and captures what the loop sent. */
function model(script: Anthropic.Message[]): MessagesClient & { sent: Anthropic.MessageCreateParamsNonStreaming[] } {
  const sent: Anthropic.MessageCreateParamsNonStreaming[] = [];
  let turn = 0;
  return {
    sent,
    messages: {
      async create(params) {
        sent.push(structuredClone(params));
        const next = script[Math.min(turn, script.length - 1)];
        turn += 1;
        return next;
      },
    },
  };
}

/** `tools` is a union that also covers nameless server toolsets, so narrow before reading. */
function toolNames(params: Anthropic.MessageCreateParamsNonStreaming) {
  return (params.tools ?? []).flatMap((tool) => ("name" in tool ? [tool.name] : []));
}

const base = { runId: "run_1", goal: "How many projects are there?", allowWrites: false };

describe("runAgent", () => {
  it("completes when the model answers without reaching for a tool", async () => {
    const { client } = surface();
    const outcome = await runAgent({ anthropic: model([message([text("There are 3.")], "end_turn")]), surface: client, ...base });

    expect(outcome.status).toBe("completed");
    expect(outcome.finalText).toBe("There are 3.");
    expect(outcome.invocationCount).toBe(0);
  });

  it("invokes a capability and records the receipt on the step", async () => {
    const { client, invocations } = surface();
    const outcome = await runAgent({
      anthropic: model([
        message([toolUse("toolu_1", "list_projects")], "tool_use"),
        message([text("There is 1 project.")], "end_turn"),
      ]),
      surface: client,
      ...base,
    });

    expect(outcome.status).toBe("completed");
    expect(invocations).toEqual([{ operationId: "list_projects", idempotencyKey: "run_1:toolu_1" }]);
    const invocation = outcome.steps.find((step) => step.kind === "invocation");
    expect(invocation).toMatchObject({ operationId: "list_projects", receiptId: "rcp_1", statusCode: 200 });
  });

  it("halts without invoking when the model reaches for a gated capability", async () => {
    const { client, invocations } = surface();
    const outcome = await runAgent({
      anthropic: model([message([toolUse("toolu_1", "invite_member", { email: "x@y.z" })], "tool_use")]),
      surface: client,
      ...base,
      allowWrites: true,
    });

    expect(outcome.status).toBe("halted");
    expect(outcome.haltReason).toBe("approval_required");
    // The point of the gate: the call never reached the vendor.
    expect(invocations).toEqual([]);
    expect(outcome.steps.at(-1)).toMatchObject({ kind: "halt", operationId: "invite_member", policy: "approval_required" });
  });

  it("stops at the step budget", async () => {
    const { client } = surface();
    const outcome = await runAgent({
      anthropic: model([message([toolUse("toolu_1", "list_projects")], "tool_use")]),
      surface: client,
      ...base,
      bounds: { maxSteps: 3 },
    });

    expect(outcome.haltReason).toBe("step_limit");
    expect(outcome.steps.filter((step) => step.kind === "invocation")).toHaveLength(3);
  });

  it("stops at the invocation budget even with steps left", async () => {
    const { client, invocations } = surface();
    const outcome = await runAgent({
      anthropic: model([message([toolUse("toolu_1", "list_projects")], "tool_use")]),
      surface: client,
      ...base,
      bounds: { maxSteps: 10, maxInvocations: 2 },
    });

    expect(outcome.haltReason).toBe("invocation_limit");
    expect(invocations).toHaveLength(2);
  });

  it("stops at the wall-clock deadline", async () => {
    const { client } = surface();
    let clock = 0;
    const outcome = await runAgent({
      anthropic: model([message([toolUse("toolu_1", "list_projects")], "tool_use")]),
      surface: client,
      ...base,
      bounds: { deadlineMs: 5_000 },
      now: () => (clock += 4_000),
    });

    expect(outcome.haltReason).toBe("time_limit");
  });

  it("records a refusal instead of reading the refused content", async () => {
    const { client } = surface();
    const refused = message([], "refusal");
    refused.stop_details = { type: "refusal", category: "cyber", explanation: "declined" } as Anthropic.Message["stop_details"];
    const outcome = await runAgent({ anthropic: model([refused]), surface: client, ...base });

    expect(outcome.status).toBe("failed");
    expect(outcome.steps.at(-1)).toMatchObject({ kind: "refusal", detail: { category: "cyber" } });
  });

  it("hands a policy denial back to the model as a tool error and keeps going", async () => {
    const { client } = surface({ invoke: () => ({ status: 403, body: { error: "Capability is prohibited by policy" } }) });
    const modelStub = model([
      message([toolUse("toolu_1", "list_projects")], "tool_use"),
      message([text("I could not read projects: the capability is denied by policy.")], "end_turn"),
    ]);
    const outcome = await runAgent({ anthropic: modelStub, surface: client, ...base });

    expect(outcome.status).toBe("completed");
    const denial = outcome.steps.find((step) => step.kind === "invocation");
    expect(denial).toMatchObject({ statusCode: 403 });

    const followUp = modelStub.sent[1].messages.at(-1);
    expect(followUp?.role).toBe("user");
    expect(JSON.stringify(followUp?.content)).toContain("prohibited by policy");
  });

  it("returns every parallel tool result in a single user message", async () => {
    const { client } = surface();
    const modelStub = model([
      message([toolUse("toolu_1", "list_projects"), toolUse("toolu_2", "list_projects")], "tool_use"),
      message([text("Done.")], "end_turn"),
    ]);
    await runAgent({ anthropic: modelStub, surface: client, ...base });

    const followUp = modelStub.sent[1].messages.at(-1);
    expect(followUp?.role).toBe("user");
    expect(Array.isArray(followUp?.content) && followUp.content).toHaveLength(2);
  });

  it("withholds a reversible capability from a read-only run, and admits it when writes are allowed", async () => {
    const { client } = surface();
    const readOnly = model([message([text("ok")], "end_turn")]);
    await runAgent({ anthropic: readOnly, surface: client, ...base, allowWrites: false });
    // create_project is absent; invite_member is present but gated, because the
    // model should be able to see the capability it is not allowed to trigger.
    expect(toolNames(readOnly.sent[0])).toEqual(["list_projects", "invite_member"]);

    const writable = model([message([text("ok")], "end_turn")]);
    await runAgent({ anthropic: writable, surface: client, ...base, allowWrites: true });
    expect(toolNames(writable.sent[0])).toEqual(["list_projects", "create_project", "invite_member"]);
  });

  it("records why each capability was withheld on the opening step", async () => {
    const { client } = surface();
    const outcome = await runAgent({ anthropic: model([message([text("ok")], "end_turn")]), surface: client, ...base });

    expect(outcome.steps[0].detail.withheld).toEqual([
      { operation_id: "create_project", policy: "reversible", reason: "run does not allow writes" },
    ]);
  });

  it("echoes the assistant content back so thinking blocks survive the next turn", async () => {
    const { client } = surface();
    const modelStub = model([
      message([toolUse("toolu_1", "list_projects")], "tool_use"),
      message([text("Done.")], "end_turn"),
    ]);
    await runAgent({ anthropic: modelStub, surface: client, ...base });

    const assistantTurn = modelStub.sent[1].messages[1];
    expect(assistantTurn.role).toBe("assistant");
    expect(Array.isArray(assistantTurn.content)).toBe(true);
  });
});
