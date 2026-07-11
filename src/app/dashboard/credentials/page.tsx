import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { ConsoleTable } from "@/components/ConsoleTable";

export default async function CredentialsPage() {
  const organization = await getCurrentOrganization();
  const rows = await query<{ id: string; prefix: string; agent: string; status: string; expires: string; last_used: string }>(
    `SELECT c.id, c.token_prefix || '…' prefix, a.name agent, CASE WHEN c.revoked_at IS NOT NULL THEN 'Revoked' WHEN c.expires_at < now() THEN 'Expired' ELSE 'Active' END status,
      to_char(c.expires_at, 'Mon DD, YYYY HH24:MI') expires, coalesce(to_char(c.last_used_at, 'Mon DD, YYYY HH24:MI'), 'Never') last_used
     FROM credentials c JOIN agent_accounts a ON a.id=c.agent_account_id JOIN sandboxes s ON s.id=a.sandbox_id JOIN projects p ON p.id=s.project_id
     WHERE p.organization_id=$1 ORDER BY c.created_at DESC`, [organization.id]);
  return <div className="console-page"><header className="page-header"><div><p className="kicker">Access security</p><h1>Credentials</h1><p>Only one-way token hashes are stored. Raw short-lived credentials are returned once at issuance.</p></div></header><ConsoleTable columns={[{key:"prefix",label:"Token prefix"},{key:"agent",label:"Agent"},{key:"status",label:"Status"},{key:"expires",label:"Expires"},{key:"last_used",label:"Last used"}]} rows={rows} empty="Credentials appear when a sandbox agent registers." /></div>;
}
