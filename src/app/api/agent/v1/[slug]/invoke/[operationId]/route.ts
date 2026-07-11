import { executeCapability, ExecutionError } from "@/lib/execution";

export async function POST(request: Request, { params }: { params: Promise<{ slug: string; operationId: string }> }) {
  try {
    const { slug, operationId } = await params;
    const authorization = request.headers.get("authorization");
    if (!authorization?.startsWith("Bearer ")) throw new ExecutionError("Bearer agent credential required", 401);
    const idempotencyKey = request.headers.get("idempotency-key");
    if (!idempotencyKey || idempotencyKey.length > 128) throw new ExecutionError("A valid Idempotency-Key header is required", 400);
    const body = await request.json().catch(() => ({}));
    const result = await executeCapability({ sandboxSlug: slug, token: authorization.slice(7), operationId, body, idempotencyKey });
    const statusCode = "status_code" in result ? Number(result.status_code) : 200;
    return Response.json(result, { status: statusCode });
  } catch (error) {
    const status = error instanceof ExecutionError ? error.status : 500;
    return Response.json({ error: error instanceof Error ? error.message : "Invocation failed" }, { status });
  }
}
