import { query } from "@/lib/db";
import { executeCapability, ExecutionError } from "@/lib/execution";
import { createOpaqueId } from "@/lib/ids";

type RpcRequest = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> };
const rpc = (id: RpcRequest["id"], result: unknown) => Response.json({ jsonrpc: "2.0", id: id ?? null, result });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let body: RpcRequest;
  try { body = await request.json(); } catch { return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, { status: 400 }); }
  try {
    if (body.method === "initialize") return rpc(body.id, { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "agent-access", version: "1.0.0" } });
    if (body.method === "tools/list") {
      const tools = await query<Record<string, unknown>>(
        `SELECT c.operation_id name, c.summary description, c.input_schema "inputSchema"
         FROM capabilities c JOIN sandboxes s ON s.project_id = c.project_id
         WHERE s.slug = $1 AND s.status = 'published' AND c.enabled AND c.policy <> 'prohibited' ORDER BY c.operation_id`,
        [slug],
      );
      return rpc(body.id, { tools });
    }
    if (body.method === "tools/call") {
      const authorization = request.headers.get("authorization");
      if (!authorization?.startsWith("Bearer ")) throw new ExecutionError("Bearer agent credential required", 401);
      const name = String(body.params?.name ?? "");
      const args = (body.params?.arguments ?? {}) as Record<string, unknown>;
      const receipt = await executeCapability({ sandboxSlug: slug, token: authorization.slice(7), operationId: name, body: args, idempotencyKey: request.headers.get("idempotency-key") ?? createOpaqueId("mcp") });
      return rpc(body.id, { content: [{ type: "text", text: JSON.stringify(receipt.response) }], structuredContent: receipt.response, _meta: { receipt_id: receipt.receipt_id, signature: receipt.signature } });
    }
    return Response.json({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32601, message: "Method not found" } }, { status: 404 });
  } catch (error) {
    const status = error instanceof ExecutionError ? error.status : 400;
    return Response.json({ jsonrpc: "2.0", id: body.id ?? null, error: { code: -32000, message: error instanceof Error ? error.message : "Request failed" } }, { status });
  }
}
