import { assertProjectAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { CapabilityEditor } from "@/components/CapabilityEditor";
import { notFound } from "next/navigation";
import Link from "next/link";
import { IconRefresh } from "@tabler/icons-react";

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params; await assertProjectAccess(projectId);
  const projects = await query<{ id: string; name: string; sandbox_id: string }>("SELECT p.id, p.name, s.id sandbox_id FROM projects p JOIN sandboxes s ON s.project_id = p.id WHERE p.id = $1", [projectId]);
  if (!projects[0]) notFound();
  const capabilities = await query<Record<string, unknown>>("SELECT id, operation_id, method, path, summary, policy, scope, enabled, input_schema FROM capabilities WHERE project_id = $1 ORDER BY path, method", [projectId]);
  const connections = await query<{ status: string; origin: string }>("SELECT status,origin FROM vendor_connections WHERE project_id=$1 AND status <> 'revoked'", [projectId]);
  const pending = await query<{ id: string; revision_number: number; change_count: string }>("SELECT id,revision_number,(analysis->'changes'->>'total') change_count FROM import_revisions WHERE project_id=$1 AND status='pending' ORDER BY created_at DESC LIMIT 1", [projectId]);
  return <div className="workbench-page"><header className="workbench-header project-review-header"><div><p className="kicker">OpenAPI import · {projects[0].name}</p><h1>Review capabilities</h1>{connections[0] && <p className={`connection-state ${connections[0].status}`}><span /> {connections[0].status} staging connection · {connections[0].origin}</p>}</div><Link className="button ghost" href={`/dashboard/import?project=${projectId}`}><IconRefresh size={16} />Check new revision</Link></header>{pending[0] && <div className="pending-revision"><div><strong>Revision {pending[0].revision_number} is waiting for review</strong><span>{pending[0].change_count ?? "0"} detected changes · published permissions are unchanged</span></div><Link className="button ghost" href={`/dashboard/projects/${projectId}/revisions/${pending[0].id}`}>Review revision</Link></div>}<CapabilityEditor projectId={projectId} sandboxId={projects[0].sandbox_id} capabilities={capabilities as never} shadowMode={!!connections[0]} /></div>;
}
