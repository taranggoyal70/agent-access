import { assertProjectAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { CapabilityEditor } from "@/components/CapabilityEditor";
import { notFound } from "next/navigation";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params; await assertProjectAccess(projectId);
  const projects = await query<{ id: string; name: string; sandbox_id: string }>("SELECT p.id, p.name, s.id sandbox_id FROM projects p JOIN sandboxes s ON s.project_id = p.id WHERE p.id = $1", [projectId]);
  if (!projects[0]) notFound();
  const capabilities = await query<Record<string, unknown>>("SELECT id, operation_id, method, path, summary, policy, scope, enabled, input_schema FROM capabilities WHERE project_id = $1 ORDER BY path, method", [projectId]);
  return <div className="workbench-page"><header className="workbench-header"><div><p className="kicker">OpenAPI import · {projects[0].name}</p><h1>Review capabilities</h1></div></header><CapabilityEditor projectId={projectId} sandboxId={projects[0].sandbox_id} capabilities={capabilities as never} /></div>;
}
