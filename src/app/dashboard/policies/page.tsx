import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { ConsoleTable } from "@/components/ConsoleTable";

export default async function PoliciesPage() {
  const organization = await getCurrentOrganization();
  const rows = await query<{ id: string; operation: string; project: string; route: string; policy: string; status: string }>(
    `SELECT c.id, c.operation_id operation, p.name project, c.method || ' ' || c.path route, replace(c.policy, '_', ' ') policy,
      CASE WHEN c.enabled THEN 'Enabled' ELSE 'Disabled' END status FROM capabilities c JOIN projects p ON p.id=c.project_id
     WHERE p.organization_id=$1 ORDER BY p.created_at DESC, c.path`, [organization.id]);
  return <div className="console-page"><header className="page-header"><div><p className="kicker">Governance</p><h1>Capability policies</h1><p>One review surface for every operation exposed to external agents.</p></div></header><ConsoleTable columns={[{key:"operation",label:"Capability"},{key:"project",label:"Project"},{key:"route",label:"Route"},{key:"policy",label:"Policy"},{key:"status",label:"Status"}]} rows={rows} empty="Import an OpenAPI contract to create capability policies." /></div>;
}
