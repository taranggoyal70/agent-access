import { query } from "@/lib/db";

export async function GET(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const sandboxes = await query<{ id: string; name: string; slug: string; version: string }>("SELECT id, name, slug, version FROM sandboxes WHERE slug = $1 AND status = 'published'", [slug]);
  if (!sandboxes[0]) return Response.json({ error: "Agent surface not found" }, { status: 404 });
  const capabilities = await query<Record<string, unknown>>(
    `SELECT c.operation_id name, c.summary description, c.method, c.path, c.input_schema, c.output_schema, c.policy, c.scope
     FROM capabilities c JOIN sandboxes s ON s.project_id = c.project_id WHERE s.id = $1 AND c.enabled AND c.policy <> 'prohibited' ORDER BY c.operation_id`,
    [sandboxes[0].id],
  );
  const origin = new URL(request.url).origin;
  return Response.json({
    schema_version: "2026-07-01",
    name: sandboxes[0].name,
    version: sandboxes[0].version,
    environment: "sandbox",
    registration_endpoint: `${origin}/api/agent/v1/${slug}/accounts`,
    capabilities_endpoint: `${origin}/api/agent/v1/${slug}/capabilities`,
    invocation_endpoint: `${origin}/api/agent/v1/${slug}/invoke/{capability}`,
    mcp_endpoint: `${origin}/mcp/${slug}`,
    capabilities,
  });
}
