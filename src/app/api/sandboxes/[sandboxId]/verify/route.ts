import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { createOpaqueId } from "@/lib/ids";
import { registerSandboxAgent } from "@/lib/registration";
import { executeCapability } from "@/lib/execution";

export async function POST(_: Request, { params }: { params: Promise<{ sandboxId: string }> }) {
  try {
    const { sandboxId } = await params;
    const organization = await getCurrentOrganization();
    const rows = await query<{ slug: string; name: string }>(
      `SELECT s.slug, s.name FROM sandboxes s JOIN projects p ON p.id = s.project_id
       WHERE s.id = $1 AND p.organization_id = $2 AND s.status = 'published'`,
      [sandboxId, organization.id],
    );
    if (!rows[0]) throw new Error("Publish this sandbox before verification");
    const capabilities = await query<{ operation_id: string; method: string }>(
      `SELECT c.operation_id, c.method FROM capabilities c JOIN sandboxes s ON s.project_id = c.project_id
       WHERE s.id = $1 AND c.enabled AND c.policy <> 'prohibited'
       ORDER BY CASE WHEN c.method = 'POST' THEN 0 ELSE 1 END, c.operation_id LIMIT 1`,
      [sandboxId],
    );
    const capability = capabilities[0];
    if (!capability) throw new Error("No executable capability is available");
    const registration = await registerSandboxAgent(rows[0].slug, "YC Demo Agent", [capability.operation_id]);
    const body = capability.method === "POST" ? { name: "Website Redesign", key: `website-redesign-${Date.now().toString(36)}` } : {};
    const receipt = await executeCapability({ sandboxSlug: rows[0].slug, token: registration.credential, operationId: capability.operation_id, body, idempotencyKey: createOpaqueId("idem") });
    return Response.json({ trace: ["discovery", "registration", "delegation", "invocation"], registration: { agent_account_id: registration.agent_account_id, delegation_id: registration.delegation_id }, receipt });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Verification failed" }, { status: 400 });
  }
}
