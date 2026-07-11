import { assertProjectAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { testVendorConnection, type VendorConnection } from "@/lib/vendor-connection";

export async function POST(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  try {
    const organization = await assertProjectAccess(projectId);
    const rows = await query<VendorConnection>("SELECT * FROM vendor_connections WHERE project_id=$1 AND status <> 'revoked'", [projectId]);
    if (!rows[0]) throw new Error("No Vendor Connection is configured");
    const result = await testVendorConnection(rows[0]);
    await query("UPDATE vendor_connections SET status='active',last_tested_at=now(),last_error=NULL,updated_at=now() WHERE id=$1", [rows[0].id]);
    await query("INSERT INTO audit_events (organization_id,actor_type,actor_id,action,target_type,target_id,metadata) VALUES ($1,'user',$2,'vendor_connection.activated','vendor_connection',$3,$4::jsonb)", [organization.id, organization.id, rows[0].id, JSON.stringify({ status: result.status })]);
    return Response.json(result);
  } catch (error) {
    await query("UPDATE vendor_connections SET status='failed',last_tested_at=now(),last_error=$2,updated_at=now() WHERE project_id=$1", [projectId, error instanceof Error ? error.message : "Connection test failed"]).catch(() => undefined);
    return Response.json({ error: error instanceof Error ? error.message : "Connection test failed" }, { status: 400 });
  }
}
