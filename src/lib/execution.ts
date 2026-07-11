import { query } from "./db";
import { createOpaqueId, hashSecret } from "./ids";
import { signReceipt, verifyReceipt } from "./receipts";

type CredentialContext = {
  credential_id: string;
  agent_account_id: string;
  agent_name: string;
  principal_id: string;
  principal_name: string;
  delegation_id: string;
  sandbox_id: string;
  sandbox_slug: string;
  capability_id: string;
  operation_id: string;
  method: string;
  path: string;
  policy: string;
  scope: string;
  organization_id: string;
};

export type ExecutionReceipt = Record<string, unknown> & {
  receipt_id: string;
  status_code: number;
  response: unknown;
  signature: string;
  replayed?: boolean;
};

export async function executeCapability(options: {
  sandboxSlug: string;
  token: string;
  operationId: string;
  body?: Record<string, unknown>;
  idempotencyKey: string;
}): Promise<ExecutionReceipt> {
  const contexts = await query<CredentialContext>(
    `SELECT c.id credential_id, a.id agent_account_id, a.name agent_name,
            p.id principal_id, p.display_name principal_name, d.id delegation_id,
            s.id sandbox_id, s.slug sandbox_slug, cap.id capability_id,
            cap.operation_id, cap.method, cap.path, cap.policy, cap.scope, project.organization_id
     FROM credentials c
     JOIN agent_accounts a ON a.id = c.agent_account_id
     JOIN delegations d ON d.id = c.delegation_id
     JOIN principals p ON p.id = d.principal_id
     JOIN sandboxes s ON s.id = a.sandbox_id
     JOIN projects project ON project.id = s.project_id
     JOIN capabilities cap ON cap.operation_id = $3 AND cap.project_id = s.project_id AND cap.id = ANY(d.capability_ids)
     WHERE c.token_hash = $1 AND s.slug = $2 AND c.revoked_at IS NULL AND c.expires_at > now()
       AND d.status = 'approved' AND d.expires_at > now() AND a.status = 'active' AND s.status = 'published'`,
    [hashSecret(options.token), options.sandboxSlug, options.operationId],
  );
  const context = contexts[0];
  if (!context) throw new ExecutionError("Invalid, expired, or insufficient agent credential", 401);
  if (context.policy === "prohibited") throw new ExecutionError("Capability is prohibited by policy", 403);

  const existing = await query<{ payload: Record<string, unknown>; signature: string }>(
    `SELECT r.payload, r.signature FROM executions e JOIN receipts r ON r.execution_id=e.id
     WHERE e.agent_account_id=$1 AND e.idempotency_key=$2`, [context.agent_account_id, options.idempotencyKey]);
  if (existing[0]) return { ...existing[0].payload, signature: existing[0].signature, replayed: true } as ExecutionReceipt;

  const counts = await query<{ request_count: number }>(
    `INSERT INTO rate_windows (credential_id, window_start, request_count)
     VALUES ($1, date_trunc('minute', now()), 1)
     ON CONFLICT (credential_id, window_start) DO UPDATE SET request_count = rate_windows.request_count + 1
     RETURNING request_count`,
    [context.credential_id],
  );
  if (counts[0].request_count > 60) throw new ExecutionError("Credential rate limit exceeded", 429);

  const start = Date.now();
  const resourceType = context.path.split("/").filter(Boolean)[0] ?? "resources";
  let responseBody: Record<string, unknown> | Record<string, unknown>[];
  let statusCode = 200;

  if (context.method === "GET") {
    responseBody = await query<Record<string, unknown>>(
      "SELECT id, data, created_at, updated_at FROM sandbox_resources WHERE sandbox_id = $1 AND resource_type = $2 ORDER BY created_at DESC LIMIT 100",
      [context.sandbox_id, resourceType],
    );
  } else if (context.method === "POST") {
    const result = { id: createOpaqueId(resourceType.slice(0, 3) || "res"), ...(options.body ?? {}) };
    await query("INSERT INTO sandbox_resources (sandbox_id, resource_type, data) VALUES ($1, $2, $3::jsonb)", [context.sandbox_id, resourceType, JSON.stringify(result)]);
    responseBody = { status: "success", capability: context.operation_id, result };
    statusCode = 201;
  } else {
    responseBody = { status: "accepted", capability: context.operation_id, result: options.body ?? {} };
  }

  const durationMs = Math.max(1, Date.now() - start);
  const executions = await query<{ id: string; created_at: string }>(
    `INSERT INTO executions (sandbox_id, agent_account_id, capability_id, idempotency_key, request_body, response_body, status_code, duration_ms, policy_decision)
     VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9) RETURNING id, created_at`,
    [context.sandbox_id, context.agent_account_id, context.capability_id, options.idempotencyKey, JSON.stringify(options.body ?? {}), JSON.stringify(responseBody), statusCode, durationMs, context.policy],
  );
  const receiptId = createOpaqueId("rcp");
  const payload = {
    receipt_id: receiptId,
    execution_id: executions[0].id,
    issued_at: executions[0].created_at,
    environment: "sandbox",
    principal: { id: context.principal_id, name: context.principal_name },
    agent: { id: context.agent_account_id, name: context.agent_name, type: "external" },
    delegation_id: context.delegation_id,
    capability: { id: context.capability_id, operation_id: context.operation_id, method: context.method, path: context.path, scope: context.scope, policy: context.policy },
    idempotency_key: options.idempotencyKey,
    request: options.body ?? {},
    response: responseBody,
    status_code: statusCode,
    duration_ms: durationMs,
  };
  const signed = signReceipt(payload);
  await query(
    "INSERT INTO receipts (execution_id, payload, signature, signature_hash) VALUES ($1, $2::jsonb, $3, $4)",
    [executions[0].id, JSON.stringify(payload), signed.signature, signed.signatureHash],
  );
  await query("UPDATE credentials SET last_used_at = now() WHERE id = $1", [context.credential_id]);
  await query(
    `INSERT INTO audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, metadata)
     VALUES ($1,'agent',$2,'capability.executed','execution',$3,$4::jsonb)`,
    [context.organization_id, context.agent_account_id, executions[0].id, JSON.stringify({ capability: context.operation_id, status_code: statusCode, receipt_id: receiptId })],
  );
  return { ...payload, signature: signed.signature, verified: verifyReceipt(payload, signed.signature), response: responseBody };
}

export class ExecutionError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
