import { getCurrentOrganization } from "@/lib/auth";
import { loadImportSource, preflightOpenApi } from "@/lib/import-preflight";
import { query } from "@/lib/db";
import { assertSafeHttpsUrl } from "@/lib/safe-url";
import { z } from "zod";

const schema = z.object({
  sourceType: z.enum(["url", "file", "paste", "sample"]),
  source: z.string().max(1_000_000).optional(),
  sourceUrl: z.string().max(2048).optional(),
  sourceToken: z.string().max(4096).optional(),
  projectId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  try {
    const organization = await getCurrentOrganization();
    const input = schema.parse(await request.json());
    let existing: { operation_id: string; method: string; path: string; policy: string }[] = [];
    if (input.projectId) {
      const projects = await query<{ id: string }>("SELECT id FROM projects WHERE id=$1 AND organization_id=$2", [input.projectId, organization.id]);
      if (!projects[0]) throw new Error("Project not found");
      existing = await query("SELECT operation_id, method, path, policy FROM capabilities WHERE project_id=$1", [input.projectId]);
    }
    const source = await loadImportSource(input);
    const result = preflightOpenApi(source, existing);
    let originSafety: { safe: boolean; message: string } = { safe: false, message: "No server origin declared" };
    if (result.baseUrl) {
      try { const url = await assertSafeHttpsUrl(result.baseUrl); originSafety = { safe: true, message: `Approved HTTPS origin: ${url.origin}` }; }
      catch (error) { originSafety = { safe: false, message: error instanceof Error ? error.message : "Origin failed safety checks" }; }
    }
    return Response.json({
      title: result.title,
      version: result.version,
      baseUrl: result.baseUrl,
      specHash: result.specHash,
      capabilities: result.capabilities.map(({ operationId, method, path, summary, policy, scope }) => ({ operationId, method, path, summary, policy, scope })),
      analysis: { ...result.analysis, originSafety },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Preflight failed" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }
}
