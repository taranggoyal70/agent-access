import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { listRuns } from "@/lib/agent/run-store";
import { AgentRunForm } from "@/components/AgentRunForm";
import { ConsoleTable } from "@/components/ConsoleTable";

export default async function AgentRunsPage() {
  const organization = await getCurrentOrganization();
  const [sandboxes, runs] = await Promise.all([
    query<{ slug: string; name: string }>(
      `SELECT s.slug, s.name FROM sandboxes s JOIN projects p ON p.id=s.project_id
       WHERE p.organization_id=$1 AND s.status='published' ORDER BY s.created_at DESC`,
      [organization.id],
    ),
    listRuns(organization.id),
  ]);

  const rows = runs.map((run) => ({
    id: run.id,
    goal: run.goal.length > 72 ? `${run.goal.slice(0, 72)}...` : run.goal,
    sandbox: run.sandbox_slug,
    outcome: run.halt_reason ? `${run.status} (${run.halt_reason.replaceAll("_", " ")})` : run.status,
    calls: String(run.invocation_count),
    started: run.started_at,
  }));

  return <div className="console-page">
    <header className="page-header"><div>
      <p className="kicker">Agent runtime</p>
      <h1>Agent runs</h1>
      <p>An agent pursuing one goal through the published surface, under a delegated credential, leaving a signed receipt for every call it makes.</p>
    </div></header>
    <AgentRunForm sandboxes={sandboxes} />
    <ConsoleTable
      columns={[{ key: "goal", label: "Goal" }, { key: "sandbox", label: "Sandbox" }, { key: "outcome", label: "Outcome" }, { key: "calls", label: "Calls" }, { key: "started", label: "Started" }]}
      rows={rows}
      empty="No agent runs yet."
      linkKey="goal"
      linkPrefix="/dashboard/runs/"
    />
  </div>;
}
