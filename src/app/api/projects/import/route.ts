import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { parseOpenApi } from "@/lib/openapi";
import { slugify } from "@/lib/ids";
import { sampleOpenApi } from "@/lib/sample";

export async function POST(request: Request) {
  try {
    const organization = await getCurrentOrganization();
    const body = await request.json();
    const source = body.sample === true ? JSON.stringify(sampleOpenApi) : String(body.source ?? "");
    const parsed = parseOpenApi(source);
    const baseSlug = slugify(parsed.title);
    const slug = `${baseSlug}-${Date.now().toString(36)}`;
    const projects = await query<{ id: string }>(
      `INSERT INTO projects (organization_id, name, slug, openapi_name, openapi_version, base_url, source_spec, status)
       VALUES ($1, $2, $3, $2, $4, $5, $6::jsonb, 'review') RETURNING id`,
      [organization.id, parsed.title, slug, parsed.version, parsed.baseUrl, JSON.stringify(parsed.document)],
    );
    const projectId = projects[0].id;
    try {
      for (const capability of parsed.capabilities) {
        await query(
          `INSERT INTO capabilities (project_id, operation_id, method, path, summary, input_schema, output_schema, policy, scope)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9)`,
          [projectId, capability.operationId, capability.method, capability.path, capability.summary, JSON.stringify(capability.inputSchema), JSON.stringify(capability.outputSchema), capability.policy, capability.scope],
        );
      }
      const sandboxes = await query<{ id: string }>(
        `INSERT INTO sandboxes (project_id, name, slug, version) VALUES ($1, $2, $3, $4) RETURNING id`,
        [projectId, `${parsed.title} Sandbox`, slug, `${parsed.version}.1`],
      );
      await query("INSERT INTO audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, metadata) VALUES ($1,'user',$2,'openapi.imported','project',$3,$4::jsonb)", [organization.id, organization.id, projectId, JSON.stringify({ capability_count: parsed.capabilities.length })]);
      return Response.json({ projectId, sandboxId: sandboxes[0].id, capabilityCount: parsed.capabilities.length }, { status: 201 });
    } catch (error) {
      await query("DELETE FROM projects WHERE id = $1", [projectId]);
      throw error;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to import OpenAPI document";
    return Response.json({ error: message }, { status: 400 });
  }
}
