import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { ConsoleTable } from "@/components/ConsoleTable";

export default async function ReceiptsPage() {
  const organization = await getCurrentOrganization();
  const rows = await query<{ id: string; receipt: string; agent: string; capability: string; status: string; issued: string }>(
    `SELECT r.id, r.payload->>'receipt_id' receipt, a.name agent, c.operation_id capability, e.status_code::text status, to_char(r.created_at, 'Mon DD, YYYY HH24:MI:SS') issued
     FROM receipts r JOIN executions e ON e.id=r.execution_id JOIN agent_accounts a ON a.id=e.agent_account_id JOIN capabilities c ON c.id=e.capability_id
     JOIN sandboxes s ON s.id=e.sandbox_id JOIN projects p ON p.id=s.project_id WHERE p.organization_id=$1 ORDER BY r.created_at DESC`, [organization.id]);
  return <div className="console-page"><header className="page-header"><div><p className="kicker">Execution proof</p><h1>Signed receipts</h1><p>Tamper-evident evidence binding the agent, principal, delegation, request, and policy decision.</p></div></header><ConsoleTable columns={[{key:"receipt",label:"Receipt"},{key:"agent",label:"Agent"},{key:"capability",label:"Capability"},{key:"status",label:"HTTP"},{key:"issued",label:"Issued"}]} rows={rows} empty="Receipts appear after an agent invokes a capability." /></div>;
}
