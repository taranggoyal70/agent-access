import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { ConsoleTable } from "@/components/ConsoleTable";

export default async function AgentsPage() {
  const organization = await getCurrentOrganization();
  const rows = await query<{ id: string; name: string; sandbox: string; status: string; delegation: string; created: string }>(
    `SELECT a.id, a.name, s.name sandbox, a.status, coalesce(d.status, 'none') delegation, to_char(a.created_at, 'Mon DD, YYYY HH24:MI') created
     FROM agent_accounts a JOIN sandboxes s ON s.id=a.sandbox_id JOIN projects p ON p.id=s.project_id
     LEFT JOIN LATERAL (SELECT status FROM delegations WHERE agent_account_id=a.id ORDER BY created_at DESC LIMIT 1) d ON true
     WHERE p.organization_id=$1 ORDER BY a.created_at DESC`, [organization.id]);
  return <div className="console-page"><header className="page-header"><div><p className="kicker">Machine identities</p><h1>Agent accounts</h1><p>External agents are first-class accounts, each bound to a principal and scoped delegation.</p></div></header><ConsoleTable columns={[{key:"name",label:"Agent"},{key:"sandbox",label:"Sandbox"},{key:"status",label:"Account"},{key:"delegation",label:"Delegation"},{key:"created",label:"Registered"}]} rows={rows} empty="Run a sandbox verification to register the first agent account." /></div>;
}
