import { randomUUID } from "node:crypto";
import { query } from "../src/lib/db";
import { executeCapability, ExecutionError } from "../src/lib/execution";
import { registerSandboxAgent } from "../src/lib/registration";
import { verifyReceipt } from "../src/lib/receipts";

async function main() {
  await query("DELETE FROM organizations WHERE owner_clerk_id LIKE 'smoke-%'");
  const suffix = randomUUID().slice(0, 8);
  const organizations = await query<{ id: string }>(
    "INSERT INTO organizations (owner_clerk_id,name,slug) VALUES ($1,$2,$3) RETURNING id",
    [`smoke-${suffix}`, "Smoke Test", `smoke-${suffix}`],
  );
  try {
    const projects = await query<{ id: string }>(
      `INSERT INTO projects (organization_id,name,slug,openapi_name,openapi_version,source_spec,status)
       VALUES ($1,'Smoke API',$2,'Smoke API','3.1.0','{}'::jsonb,'published') RETURNING id`,
      [organizations[0].id, `smoke-${suffix}`],
    );
    await query(
      `INSERT INTO capabilities (project_id,operation_id,method,path,summary,input_schema,output_schema,policy,scope)
       VALUES ($1,'create_widget','POST','/widgets','Create widget','{}'::jsonb,'{}'::jsonb,'approval_required','widgets:write')`,
      [projects[0].id],
    );
    await query(
      "INSERT INTO sandboxes (project_id,name,slug,version,status,published_at) VALUES ($1,'Smoke Sandbox',$2,'1.0.0','published',now())",
      [projects[0].id, `smoke-${suffix}`],
    );

    const registration = await registerSandboxAgent(`smoke-${suffix}`, "CI agent", ["create_widget"], `smoke-${suffix}`);
    const idempotencyKey = `idem-${suffix}`;
    const receipt = await executeCapability({ sandboxSlug: `smoke-${suffix}`, token: registration.credential, operationId: "create_widget", body: { name: "Verified widget" }, idempotencyKey });
    const storedReceipts = await query<{ payload: Record<string, unknown>; signature: string }>(
      "SELECT payload, signature FROM receipts WHERE payload->>'receipt_id'=$1", [receipt.receipt_id]);
    if (receipt.status_code !== 201 || !verifyReceipt(storedReceipts[0].payload, storedReceipts[0].signature)) throw new Error("Receipt verification failed");

    const replay = await executeCapability({ sandboxSlug: `smoke-${suffix}`, token: registration.credential, operationId: "create_widget", body: { name: "Different payload" }, idempotencyKey });
    if (!replay.replayed || replay.receipt_id !== receipt.receipt_id) throw new Error("Idempotency replay failed");

    let unauthorized = false;
    try { await executeCapability({ sandboxSlug: `smoke-${suffix}`, token: "invalid", operationId: "create_widget", body: {}, idempotencyKey: "invalid" }); }
    catch (error) { unauthorized = error instanceof ExecutionError && error.status === 401; }
    if (!unauthorized) throw new Error("Invalid credential was not rejected");

    await query(`INSERT INTO capabilities (project_id,operation_id,method,path,summary,input_schema,output_schema,policy,scope) VALUES ($1,'read_echo','GET','/anything','Read staging echo','{}'::jsonb,'{}'::jsonb,'read_only','echo:read')`, [projects[0].id]);
    await query("INSERT INTO vendor_connections (project_id,origin,auth_type,status,last_tested_at) VALUES ($1,'https://httpbin.org','none','active',now())", [projects[0].id]);
    const upstreamAgent = await registerSandboxAgent(`smoke-${suffix}`, "Upstream CI agent", ["read_echo"], `upstream-${suffix}`);
    const upstream = await executeCapability({ sandboxSlug: `smoke-${suffix}`, token: upstreamAgent.credential, operationId: "read_echo", body: { query: { probe: "agent-access" } }, idempotencyKey: `upstream-${suffix}` });
    if (upstream.status_code !== 200 || upstream.environment !== "staging-shadow" || !upstream.result) throw new Error("Read-only upstream forwarding failed");
    const upstreamStored = await query<{ payload: { response?: { body_hash?: string; byte_size?: number } } }>("SELECT payload FROM receipts WHERE payload->>'receipt_id'=$1", [upstream.receipt_id]);
    if (!upstreamStored[0].payload.response?.body_hash || !upstreamStored[0].payload.response?.byte_size) throw new Error("Upstream receipt did not retain redacted evidence");
    process.stdout.write("End-to-end smoke test passed: import foundation → register → delegate → invoke → upstream shadow read → redacted receipt → replay protection\n");
  } finally {
    await query("DELETE FROM organizations WHERE id=$1", [organizations[0].id]);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
