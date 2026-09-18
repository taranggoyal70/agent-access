import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

import { getCurrentOrganization } from "@/lib/auth";
import { completeRun, createRun, failRun, resolveOwnedSandbox } from "@/lib/agent/run-store";
import { DEFAULT_BOUNDS, runAgent } from "@/lib/agent/runtime";
import { AgentSurfaceClient } from "@/lib/agent/surface-client";

// The loop is several model turns plus real upstream calls, so it needs more
// than the default request budget. The run's own deadline stops it first.
export const maxDuration = 300;

const requestSchema = z.object({
  sandbox_slug: z.string().min(1).max(64),
  goal: z.string().min(1).max(2000),
  allow_writes: z.boolean().optional(),
  max_steps: z.number().int().min(1).max(40).optional(),
  max_invocations: z.number().int().min(1).max(100).optional(),
  deadline_ms: z.number().int().min(1000).max(600_000).optional(),
});

export async function POST(request: Request) {
  let runId: string | null = null;
  try {
    const organization = await getCurrentOrganization();
    const input = requestSchema.parse(await request.json());

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not configured");

    const sandbox = await resolveOwnedSandbox(organization.id, input.sandbox_slug);
    if (!sandbox) throw new Error("Sandbox not found in this workspace");
    if (sandbox.status !== "published") throw new Error("Publish the sandbox before running an agent against it");

    const bounds = {
      maxSteps: input.max_steps ?? DEFAULT_BOUNDS.maxSteps,
      maxInvocations: input.max_invocations ?? DEFAULT_BOUNDS.maxInvocations,
      deadlineMs: input.deadline_ms ?? DEFAULT_BOUNDS.deadlineMs,
    };

    runId = await createRun({
      organizationId: organization.id,
      sandboxId: sandbox.id,
      goal: input.goal,
      allowWrites: input.allow_writes ?? false,
      bounds,
    });

    // The agent reaches this deployment over its own public surface rather than
    // through an in-process shortcut, so a run proves the published contract.
    const origin = process.env.AGENT_ACCESS_ORIGIN ?? new URL(request.url).origin;

    const outcome = await runAgent({
      anthropic: new Anthropic({ apiKey }),
      surface: new AgentSurfaceClient(origin, sandbox.slug),
      runId,
      goal: input.goal,
      allowWrites: input.allow_writes ?? false,
      bounds,
    });

    await completeRun(runId, outcome);

    return Response.json({
      run_id: runId,
      status: outcome.status,
      halt_reason: outcome.haltReason ?? null,
      final_text: outcome.finalText,
      invocation_count: outcome.invocationCount,
      receipts: outcome.steps.filter((step) => step.receiptId).map((step) => step.receiptId),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Agent run failed";
    // A run row already exists once the goal was accepted; mark it rather than
    // leaving it stuck in 'running' with no explanation.
    if (runId) await failRun(runId, message);
    return Response.json({ error: message, run_id: runId }, { status: 400 });
  }
}
