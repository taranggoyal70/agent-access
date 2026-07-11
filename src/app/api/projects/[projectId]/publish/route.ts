import { assertProjectAccess } from "@/lib/auth";
import { query } from "@/lib/db";

export async function POST(_: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const organization = await assertProjectAccess(projectId);
    const connections = await query<{ id: string; status: string }>("SELECT id,status FROM vendor_connections WHERE project_id=$1 AND status <> 'revoked'", [projectId]);
    if (connections[0]) {
      if (connections[0].status !== "active") throw new Error("Test and activate the staging Vendor Connection before publishing");
      await query("UPDATE capabilities SET enabled=false,updated_at=now() WHERE project_id=$1 AND method NOT IN ('GET','HEAD')", [projectId]);
    }
    const enabled = await query<{ count: string }>("SELECT count(*)::text count FROM capabilities WHERE project_id = $1 AND enabled AND policy <> 'prohibited'", [projectId]);
    if (Number(enabled[0].count) === 0) throw new Error("At least one allowed capability is required");
    const sandboxes = await query<{ id: string; slug: string }>("UPDATE sandboxes SET status = 'published', published_at = now(), updated_at = now() WHERE project_id = $1 RETURNING id, slug", [projectId]);
    await query("UPDATE projects SET status = 'published', updated_at = now() WHERE id = $1", [projectId]);
    await query("INSERT INTO audit_events (organization_id, actor_type, actor_id, action, target_type, target_id) VALUES ($1,'user',$2,'sandbox.published','sandbox',$3)", [organization.id, organization.id, sandboxes[0].id]);
    return Response.json(sandboxes[0]);
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Publish failed" }, { status: 400 });
  }
}
