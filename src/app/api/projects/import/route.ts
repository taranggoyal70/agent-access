import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { loadImportSource, preflightOpenApi } from "@/lib/import-preflight";
import { slugify } from "@/lib/ids";
import { assertSafeHttpsUrl } from "@/lib/safe-url";
import { encryptSecret } from "@/lib/encryption";
import { z } from "zod";

const connectionSchema = z.object({
  origin: z.string().max(2048),
  authType: z.enum(["none", "bearer", "api_key"]),
  headerName: z.string().min(1).max(80).optional(),
  secret: z.string().max(4096).optional(),
}).optional();

const schema = z.object({
  sourceType: z.enum(["url", "file", "paste", "sample"]),
  source: z.string().max(1_000_000).optional(),
  sourceUrl: z.string().max(2048).optional(),
  sourceToken: z.string().max(4096).optional(),
  projectId: z.string().uuid().optional(),
  expectedHash: z.string().length(64),
  connection: connectionSchema,
});

export async function POST(request: Request) {
  try {
    const organization = await getCurrentOrganization();
    const input = schema.parse(await request.json());
    const source = await loadImportSource(input);
    let existing: { operation_id: string; method: string; path: string; policy: string }[] = [];
    if (input.projectId) {
      const projects = await query<{ id: string }>("SELECT id FROM projects WHERE id=$1 AND organization_id=$2", [input.projectId, organization.id]);
      if (!projects[0]) throw new Error("Project not found");
      existing = await query("SELECT operation_id, method, path, policy FROM capabilities WHERE project_id=$1", [input.projectId]);
    }
    const parsed = preflightOpenApi(source, existing);
    if (parsed.specHash !== input.expectedHash) throw new Error("The OpenAPI source changed after preflight. Run preflight again.");
    if (!parsed.analysis.ready) throw new Error("Resolve unsupported or broken references before confirmation");

    if (input.projectId) {
      const revisions = await query<{ revision_number: number }>("SELECT coalesce(max(revision_number),0)::int revision_number FROM import_revisions WHERE project_id=$1", [input.projectId]);
      const created = await query<{ id: string }>(
        `INSERT INTO import_revisions (project_id,revision_number,source_type,source_url,spec_hash,openapi_version,source_spec,proposed_capabilities,analysis,status)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,'pending') RETURNING id`,
        [input.projectId, revisions[0].revision_number + 1, input.sourceType, input.sourceUrl ?? null, parsed.specHash, parsed.version, JSON.stringify(parsed.document), JSON.stringify(parsed.capabilities), JSON.stringify(parsed.analysis)],
      );
      await query(
        "INSERT INTO audit_events (organization_id,actor_type,actor_id,action,target_type,target_id,metadata) VALUES ($1,'user',$2,'openapi.revision_created','project',$3,$4::jsonb)",
        [organization.id, organization.id, input.projectId, JSON.stringify({ revision_id: created[0].id, change_count: parsed.analysis.changes.total })],
      );
      return Response.json({ projectId: input.projectId, revisionId: created[0].id, status: "pending_review" }, { status: 201 });
    }

    const baseSlug = slugify(parsed.title);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;
    const projects = await query<{ id: string }>(
      `INSERT INTO projects (organization_id,name,slug,openapi_name,openapi_version,base_url,source_spec,status)
       VALUES ($1,$2,$3,$2,$4,$5,$6::jsonb,'review') RETURNING id`,
      [organization.id, parsed.title, slug, parsed.version, parsed.baseUrl, JSON.stringify(parsed.document)],
    );
    const projectId = projects[0].id;
    try {
      await query(
        `INSERT INTO import_revisions (project_id,revision_number,source_type,source_url,spec_hash,openapi_version,source_spec,proposed_capabilities,analysis,status,applied_at)
         VALUES ($1,1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,'applied',now())`,
        [projectId, input.sourceType, input.sourceUrl ?? null, parsed.specHash, parsed.version, JSON.stringify(parsed.document), JSON.stringify(parsed.capabilities), JSON.stringify(parsed.analysis)],
      );
      for (const capability of parsed.capabilities) {
        await query(
          `INSERT INTO capabilities (project_id,operation_id,method,path,summary,input_schema,output_schema,policy,scope,enabled)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10)`,
          [projectId, capability.operationId, capability.method, capability.path, capability.summary, JSON.stringify(capability.inputSchema), JSON.stringify(capability.outputSchema), capability.policy, capability.scope, capability.policy === "read_only"],
        );
      }
      const sandboxes = await query<{ id: string }>("INSERT INTO sandboxes (project_id,name,slug,version) VALUES ($1,$2,$3,$4) RETURNING id", [projectId, `${parsed.title} Sandbox`, slug, `${parsed.version}.1`]);
      if (input.connection?.origin) {
        const safeOrigin = await assertSafeHttpsUrl(input.connection.origin);
        const secret = input.connection.secret?.trim();
        if (input.connection.authType !== "none" && !secret) throw new Error("A staging credential is required for the selected authentication type");
        const encrypted = secret ? encryptSecret(secret) : null;
        await query(
          `INSERT INTO vendor_connections (project_id,origin,auth_type,header_name,secret_ciphertext,secret_iv,secret_tag)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [projectId, safeOrigin.toString().replace(/\/$/, ""), input.connection.authType, input.connection.authType === "api_key" ? input.connection.headerName ?? "X-API-Key" : null, encrypted?.ciphertext ?? null, encrypted?.iv ?? null, encrypted?.tag ?? null],
        );
      }
      await query("INSERT INTO audit_events (organization_id,actor_type,actor_id,action,target_type,target_id,metadata) VALUES ($1,'user',$2,'openapi.imported','project',$3,$4::jsonb)", [organization.id, organization.id, projectId, JSON.stringify({ capability_count: parsed.capabilities.length, source_type: input.sourceType, shadow_mode: true })]);
      return Response.json({ projectId, sandboxId: sandboxes[0].id, capabilityCount: parsed.capabilities.length }, { status: 201 });
    } catch (error) { await query("DELETE FROM projects WHERE id=$1", [projectId]); throw error; }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to confirm import" }, { status: 400 });
  }
}
