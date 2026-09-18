import { query } from "../db";
import { AGENT_MODEL, type RunBounds, type RunOutcome, type RunStep } from "./runtime";

export type AgentRunRecord = {
  id: string;
  goal: string;
  status: string;
  halt_reason: string | null;
  model: string;
  allow_writes: boolean;
  step_count: number;
  invocation_count: number;
  final_text: string | null;
  started_at: string;
  finished_at: string | null;
  sandbox_slug: string;
};

/**
 * Resolves a sandbox the caller's organization actually owns.
 *
 * Runs are started from the console, so the slug arrives from a human. Scoping
 * the lookup by organization here means a slug from another tenant reads as
 * "not found" rather than starting a run against someone else's surface.
 */
export async function resolveOwnedSandbox(organizationId: string, slug: string) {
  const rows = await query<{ id: string; slug: string; status: string }>(
    `SELECT s.id, s.slug, s.status FROM sandboxes s
     JOIN projects p ON p.id = s.project_id
     WHERE s.slug = $1 AND p.organization_id = $2`,
    [slug, organizationId],
  );
  return rows[0] ?? null;
}

export async function createRun(options: {
  organizationId: string;
  sandboxId: string;
  goal: string;
  allowWrites: boolean;
  bounds: RunBounds;
}) {
  const rows = await query<{ id: string }>(
    `INSERT INTO agent_runs (organization_id, sandbox_id, goal, model, allow_writes, max_steps, max_invocations, deadline_ms)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [
      options.organizationId,
      options.sandboxId,
      options.goal,
      AGENT_MODEL,
      options.allowWrites,
      options.bounds.maxSteps,
      options.bounds.maxInvocations,
      options.bounds.deadlineMs,
    ],
  );
  return rows[0].id;
}

async function insertStep(runId: string, step: RunStep) {
  await query(
    `INSERT INTO agent_run_steps (run_id, step_index, kind, operation_id, idempotency_key, receipt_id, status_code, policy, detail)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
     ON CONFLICT (run_id, step_index, kind, operation_id) DO NOTHING`,
    [
      runId,
      step.index,
      step.kind,
      step.operationId ?? null,
      step.idempotencyKey ?? null,
      step.receiptId ?? null,
      step.statusCode ?? null,
      step.policy ?? null,
      JSON.stringify(step.detail),
    ],
  );
}

/**
 * Writes the outcome even when the run failed.
 *
 * A run that halted or errored is the more interesting audit record, so the
 * steps are persisted before the status is settled - a crash between the two
 * leaves a run visibly stuck in 'running' with its evidence intact, which is
 * recoverable, rather than a clean row with no trace of what happened.
 */
export async function completeRun(runId: string, outcome: RunOutcome) {
  for (const step of outcome.steps) await insertStep(runId, step);
  await query(
    `UPDATE agent_runs
     SET status=$2, halt_reason=$3, agent_account_id=$4, final_text=$5,
         step_count=$6, invocation_count=$7, input_tokens=$8, output_tokens=$9, finished_at=now()
     WHERE id=$1`,
    [
      runId,
      outcome.status,
      outcome.haltReason ?? null,
      outcome.agentAccountId,
      outcome.finalText,
      outcome.steps.length,
      outcome.invocationCount,
      outcome.usage.inputTokens,
      outcome.usage.outputTokens,
    ],
  );
}

export async function failRun(runId: string, message: string) {
  await query(
    `UPDATE agent_runs SET status='failed', halt_reason='model_error', final_text=$2, finished_at=now() WHERE id=$1`,
    [runId, message],
  );
}

export async function listRuns(organizationId: string) {
  return query<AgentRunRecord>(
    `SELECT r.id, r.goal, r.status, r.halt_reason, r.model, r.allow_writes, r.step_count,
            r.invocation_count, r.final_text,
            to_char(r.started_at, 'Mon DD, YYYY HH24:MI') started_at,
            to_char(r.finished_at, 'Mon DD, YYYY HH24:MI') finished_at, s.slug sandbox_slug
     FROM agent_runs r JOIN sandboxes s ON s.id = r.sandbox_id
     WHERE r.organization_id = $1 ORDER BY r.started_at DESC LIMIT 100`,
    [organizationId],
  );
}

export async function getRun(organizationId: string, runId: string) {
  const runs = await query<AgentRunRecord>(
    `SELECT r.id, r.goal, r.status, r.halt_reason, r.model, r.allow_writes, r.step_count,
            r.invocation_count, r.final_text,
            to_char(r.started_at, 'Mon DD, YYYY HH24:MI') started_at,
            to_char(r.finished_at, 'Mon DD, YYYY HH24:MI') finished_at, s.slug sandbox_slug
     FROM agent_runs r JOIN sandboxes s ON s.id = r.sandbox_id
     WHERE r.id = $1 AND r.organization_id = $2`,
    [runId, organizationId],
  );
  if (!runs[0]) return null;
  const steps = await query<{
    step_index: number;
    kind: string;
    operation_id: string | null;
    receipt_id: string | null;
    status_code: number | null;
    policy: string | null;
    detail: Record<string, unknown>;
  }>(
    "SELECT step_index, kind, operation_id, receipt_id, status_code, policy, detail FROM agent_run_steps WHERE run_id=$1 ORDER BY step_index",
    [runId],
  );
  return { run: runs[0], steps };
}
