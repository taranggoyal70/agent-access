import { query } from "@/lib/db";

export async function GET(_: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const rows = await query<Record<string, unknown>>(
    `SELECT c.operation_id, c.summary, c.method, c.path, c.input_schema, c.output_schema, c.policy, c.scope
     FROM capabilities c JOIN sandboxes s ON s.project_id = c.project_id
     WHERE s.slug = $1 AND s.status = 'published' AND c.enabled AND c.policy <> 'prohibited' ORDER BY c.operation_id`,
    [slug],
  );
  if (!rows.length) return Response.json({ error: "Agent surface not found" }, { status: 404 });
  return Response.json({ capabilities: rows });
}
