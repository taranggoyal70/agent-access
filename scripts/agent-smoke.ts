import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";

import { query } from "../src/lib/db";
import { verifyReceipt } from "../src/lib/receipts";
import { runAgent } from "../src/lib/agent/runtime";
import { AgentSurfaceClient } from "../src/lib/agent/surface-client";

/**
 * Proves the agent runtime against a real database, a real model, and the real
 * HTTP surface. Requires a running server, because the whole point is that the
 * agent is an outside client:
 *
 *   npm run dev
 *   AGENT_ACCESS_ORIGIN=http://localhost:3000 npm run agent-smoke
 */
async function main() {
  const origin = process.env.AGENT_ACCESS_ORIGIN ?? "http://localhost:3000";
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is required");

  const health = await fetch(new URL("/api/health", origin)).catch(() => null);
  if (!health?.ok) throw new Error(`No server is answering at ${origin}. Start one with 'npm run dev'.`);

  await query("DELETE FROM organizations WHERE owner_clerk_id LIKE 'agent-smoke-%'");
  const suffix = randomUUID().slice(0, 8);
  const slug = `agent-smoke-${suffix}`;
  const organizations = await query<{ id: string }>(
    "INSERT INTO organizations (owner_clerk_id,name,slug) VALUES ($1,$2,$3) RETURNING id",
    [`agent-smoke-${suffix}`, "Agent Smoke", slug],
  );

  try {
    const projects = await query<{ id: string }>(
      `INSERT INTO projects (organization_id,name,slug,openapi_name,openapi_version,source_spec,status)
       VALUES ($1,'Agent Smoke API',$2,'Agent Smoke API','3.1.0','{}'::jsonb,'published') RETURNING id`,
      [organizations[0].id, slug],
    );
    await query(
      `INSERT INTO capabilities (project_id,operation_id,method,path,summary,input_schema,output_schema,policy,scope)
       VALUES ($1,'list_widgets','GET','/widgets','List every widget in the workspace','{}'::jsonb,'{}'::jsonb,'read_only','widgets:read'),
              ($1,'invite_member','POST','/members','Invite a member to the workspace','{}'::jsonb,'{}'::jsonb,'approval_required','members:write')`,
      [projects[0].id],
    );
    const sandboxes = await query<{ id: string }>(
      "INSERT INTO sandboxes (project_id,name,slug,version,status,published_at) VALUES ($1,'Agent Smoke Sandbox',$2,'1.0.0','published',now()) RETURNING id",
      [projects[0].id, slug],
    );
    for (const name of ["alpha", "beta", "gamma"]) {
      await query("INSERT INTO sandbox_resources (sandbox_id,resource_type,data) VALUES ($1,'widgets',$2::jsonb)", [
        sandboxes[0].id,
        JSON.stringify({ id: `wdg_${name}`, name }),
      ]);
    }

    const anthropic = new Anthropic();
    const surface = new AgentSurfaceClient(origin, slug);

    // 1. A read-only goal the agent can actually finish.
    const read = await runAgent({
      anthropic,
      surface,
      runId: `smoke_read_${suffix}`,
      goal: "How many widgets exist in this workspace, and what are they called? Use the tools to find out.",
      allowWrites: false,
    });
    if (read.status !== "completed") throw new Error(`Read-only run did not complete: ${read.status} / ${read.haltReason}`);
    if (read.invocationCount < 1) throw new Error("Read-only run answered without invoking a capability");

    const receiptId = read.steps.find((step) => step.receiptId)?.receiptId;
    if (!receiptId) throw new Error("No receipt was produced");
    const stored = await query<{ payload: Record<string, unknown>; signature: string }>(
      "SELECT payload, signature FROM receipts WHERE payload->>'receipt_id'=$1",
      [receiptId],
    );
    if (!stored[0] || !verifyReceipt(stored[0].payload, stored[0].signature)) throw new Error("Agent receipt failed signature verification");

    // 2. The gate. A goal that can only be met by the approval_required
    //    capability must stop the run before anything reaches the vendor.
    const gated = await runAgent({
      anthropic,
      surface,
      runId: `smoke_gate_${suffix}`,
      goal: "Invite ops@example.com to this workspace as a member.",
      allowWrites: true,
    });
    if (gated.haltReason !== "approval_required") {
      throw new Error(`Gated capability did not halt the run: ${gated.status} / ${gated.haltReason}`);
    }
    if (gated.invocationCount !== 0) throw new Error("A gated capability was invoked");

    process.stdout.write(
      `Agent smoke test passed: discover → register → ${read.invocationCount} delegated invocation(s) → verified receipt ${receiptId} → answer\n` +
        `  answer: ${read.finalText?.replaceAll("\n", " ").slice(0, 160)}\n` +
        "  gate:   approval_required halted the run with 0 invocations\n",
    );
  } finally {
    await query("DELETE FROM organizations WHERE id=$1", [organizations[0].id]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
