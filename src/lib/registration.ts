import { query } from "./db";
import { createSecret, hashSecret } from "./ids";

export async function registerSandboxAgent(slug: string, name: string, requested?: string[], clientAddress = "internal") {
  const sandboxes = await query<{ id: string; project_id: string; organization_id: string }>(
    "SELECT s.id, s.project_id, p.organization_id FROM sandboxes s JOIN projects p ON p.id=s.project_id WHERE s.slug=$1 AND s.status='published'", [slug]);
  const sandbox = sandboxes[0];
  if (!sandbox) throw new Error("Published sandbox not found");
  const registrationCount = await query<{ request_count: number }>(
    `INSERT INTO registration_windows (sandbox_id, client_key, window_start, request_count)
     VALUES ($1, $2, date_trunc('minute', now()), 1)
     ON CONFLICT (sandbox_id, client_key, window_start) DO UPDATE SET request_count=registration_windows.request_count+1
     RETURNING request_count`, [sandbox.id, hashSecret(clientAddress)]);
  if (registrationCount[0].request_count > 10) throw new Error("Registration rate limit exceeded");
  const capabilities = await query<{ id: string; operation_id: string }>(
    `SELECT id, operation_id FROM capabilities WHERE project_id = $1 AND enabled AND policy <> 'prohibited'
     AND ($2::text[] IS NULL OR operation_id = ANY($2::text[]))`,
    [sandbox.project_id, requested?.length ? requested : null],
  );
  if (!capabilities.length) throw new Error("No requested capabilities are available");
  const principalRows = await query<{ id: string }>(
    `INSERT INTO principals (sandbox_id, display_name, external_ref)
     VALUES ($1, 'Sandbox principal', 'sandbox:auto')
     ON CONFLICT DO NOTHING RETURNING id`,
    [sandbox.id],
  );
  let principal = principalRows[0];
  if (!principal) {
    const existing = await query<{ id: string }>("SELECT id FROM principals WHERE sandbox_id = $1 AND external_ref = 'sandbox:auto' LIMIT 1", [sandbox.id]);
    principal = existing[0];
  }
  const agents = await query<{ id: string }>("INSERT INTO agent_accounts (sandbox_id, name, status) VALUES ($1, $2, 'active') RETURNING id", [sandbox.id, name.slice(0, 80)]);
  const capabilityIds = capabilities.map((capability) => capability.id);
  const delegations = await query<{ id: string; expires_at: string }>(
    `INSERT INTO delegations (agent_account_id, principal_id, capability_ids, status, approved_at, expires_at)
     VALUES ($1,$2,$3::uuid[],'approved',now(),now() + interval '1 hour') RETURNING id, expires_at`,
    [agents[0].id, principal.id, capabilityIds],
  );
  const token = createSecret("aa_sbx");
  await query(
    `INSERT INTO credentials (agent_account_id, delegation_id, token_hash, token_prefix, expires_at)
     VALUES ($1,$2,$3,$4,$5)`,
    [agents[0].id, delegations[0].id, hashSecret(token), token.slice(0, 14), delegations[0].expires_at],
  );
  await query(
    `INSERT INTO audit_events (organization_id, actor_type, actor_id, action, target_type, target_id, metadata)
     VALUES ($1,'agent',$2,'agent.registered','agent_account',$2,$3::jsonb)`,
    [sandbox.organization_id, agents[0].id, JSON.stringify({ delegation_id: delegations[0].id, capability_count: capabilities.length })],
  );
  return { agent_account_id: agents[0].id, delegation_id: delegations[0].id, capabilities: capabilities.map((item) => item.operation_id), credential: token, expires_at: delegations[0].expires_at };
}
