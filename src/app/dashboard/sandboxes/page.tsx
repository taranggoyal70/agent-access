import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { ConsoleTable } from "@/components/ConsoleTable";

export default async function SandboxesPage() {
  const organization = await getCurrentOrganization();
  const rows = await query<{ id: string; name: string; project: string; version: string; status: string; published: string }>(
    `SELECT s.id, s.name, p.name project, s.version, s.status, coalesce(to_char(s.published_at, 'Mon DD, YYYY HH24:MI'), 'Not published') published
     FROM sandboxes s JOIN projects p ON p.id=s.project_id WHERE p.organization_id=$1 ORDER BY s.created_at DESC`, [organization.id]);
  return <div className="console-page"><header className="page-header"><div><p className="kicker">Test environments</p><h1>Sandboxes</h1><p>Isolated agent surfaces with real credentials, policy enforcement, and execution receipts.</p></div></header><ConsoleTable columns={[{key:"name",label:"Sandbox"},{key:"project",label:"Project"},{key:"version",label:"Version"},{key:"status",label:"Status"},{key:"published",label:"Published"}]} rows={rows} empty="No sandboxes yet." linkKey="name" linkPrefix="/dashboard/sandboxes/" /></div>;
}
