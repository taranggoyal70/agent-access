import { assertProjectAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";

const updateSchema = z.object({ updates: z.array(z.object({ id: z.string().uuid(), policy: z.enum(["read_only", "reversible", "approval_required", "prohibited"]), enabled: z.boolean() })).min(1) });

export async function PATCH(request: Request, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const organization = await assertProjectAccess(projectId);
    const body = updateSchema.parse(await request.json());
    for (const update of body.updates) {
      await query("UPDATE capabilities SET policy = $1, enabled = $2, updated_at = now() WHERE id = $3 AND project_id = $4", [update.policy, update.enabled, update.id, projectId]);
    }
    await query(
      `INSERT INTO audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, metadata)
       VALUES ($1,'user',$2,'policies.updated','project',$3,$4::jsonb)`,
      [organization.id, organization.id, projectId, JSON.stringify({ update_count: body.updates.length })],
    );
    return Response.json({ updated: body.updates.length });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 400 });
  }
}
