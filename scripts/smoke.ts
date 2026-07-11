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
    process.stdout.write("End-to-end smoke test passed: register → delegate → credential → invoke → receipt → replay protection\n");
  } finally {
    await query("DELETE FROM organizations WHERE id=$1", [organizations[0].id]);
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
