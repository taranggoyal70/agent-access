import { assertProjectAccess } from "@/lib/auth";
import { query } from "@/lib/db";
import type { CapabilityDraft } from "@/lib/openapi";

export async function POST(_: Request, { params }: { params: Promise<{ projectId: string; revisionId: string }> }) {
  try {
    const { projectId, revisionId } = await params;
    const organization = await assertProjectAccess(projectId);
    const revisions = await query<{ source_spec: Record<string, unknown>; openapi_version: string; proposed_capabilities: CapabilityDraft[]; status: string }>("SELECT source_spec,openapi_version,proposed_capabilities,status FROM import_revisions WHERE id=$1 AND project_id=$2", [revisionId, projectId]);
    const revision = revisions[0];
    if (!revision || revision.status !== "pending") throw new Error("Pending revision not found");
    const connections = await query<{ id: string }>("SELECT id FROM vendor_connections WHERE project_id=$1 AND status <> 'revoked'", [projectId]);
    const incomingIds = revision.proposed_capabilities.map((item) => item.operationId);
    await query("UPDATE capabilities SET enabled=false,updated_at=now() WHERE project_id=$1 AND NOT (operation_id=ANY($2::text[]))", [projectId, incomingIds]);
    for (const capability of revision.proposed_capabilities) {
      const existing = await query<{ id: string; method: string; path: string }>("SELECT id,method,path FROM capabilities WHERE project_id=$1 AND operation_id=$2", [projectId, capability.operationId]);
      if (existing[0]) {
        const contractChanged = existing[0].method !== capability.method || existing[0].path !== capability.path;
        await query(`UPDATE capabilities SET method=$1,path=$2,summary=$3,input_schema=$4::jsonb,output_schema=$5::jsonb,scope=$6,enabled=CASE WHEN $7::boolean OR ($8::boolean AND $1 NOT IN ('GET','HEAD')) THEN false ELSE enabled END,updated_at=now() WHERE id=$9`, [capability.method, capability.path, capability.summary, JSON.stringify(capability.inputSchema), JSON.stringify(capability.outputSchema), capability.scope, contractChanged, !!connections[0], existing[0].id]);
      } else {
        await query(`INSERT INTO capabilities (project_id,operation_id,method,path,summary,input_schema,output_schema,policy,scope,enabled) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`, [projectId, capability.operationId, capability.method, capability.path, capability.summary, JSON.stringify(capability.inputSchema), JSON.stringify(capability.outputSchema), capability.policy, capability.scope, capability.policy === "read_only" && (!connections[0] || ["GET", "HEAD"].includes(capability.method))]);
      }
    }
    await query("UPDATE projects SET source_spec=$2::jsonb,openapi_version=$3,updated_at=now() WHERE id=$1", [projectId, JSON.stringify(revision.source_spec), revision.openapi_version]);
    await query("UPDATE import_revisions SET status='applied',applied_at=now() WHERE id=$1", [revisionId]);
    await query("INSERT INTO audit_events (organization_id,actor_type,actor_id,action,target_type,target_id,metadata) VALUES ($1,'user',$2,'openapi.revision_promoted','project',$3,$4::jsonb)", [organization.id, organization.id, projectId, JSON.stringify({ revision_id: revisionId, capability_count: revision.proposed_capabilities.length, delegations_expanded: false })]);
    return Response.json({ promoted: true, capabilityCount: revision.proposed_capabilities.length });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Promotion failed" }, { status: 400 }); }
}
