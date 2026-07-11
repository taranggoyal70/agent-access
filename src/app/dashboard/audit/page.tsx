import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { ConsoleTable } from "@/components/ConsoleTable";

export default async function AuditPage() {
  const organization = await getCurrentOrganization();
  const rows = await query<{ id: string; action: string; actor: string; target: string; occurred: string }>(
    `SELECT id, action, actor_type || ':' || left(actor_id, 12) actor, target_type || ':' || left(target_id, 12) target,
      to_char(created_at, 'Mon DD, YYYY HH24:MI:SS') occurred FROM audit_events WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 250`, [organization.id]);
  return <div className="console-page"><header className="page-header"><div><p className="kicker">Accountability</p><h1>Audit log</h1><p>Immutable product events for imports, policy changes, publishing, registrations, and executions.</p></div></header><ConsoleTable columns={[{key:"action",label:"Event"},{key:"actor",label:"Actor"},{key:"target",label:"Target"},{key:"occurred",label:"Occurred"}]} rows={rows} empty="Audit events appear as you configure and use agent surfaces." /></div>;
}
