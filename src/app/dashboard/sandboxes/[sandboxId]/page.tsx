import { getCurrentOrganization } from "@/lib/auth";
import { query } from "@/lib/db";
import { VerificationConsole } from "@/components/VerificationConsole";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

export default async function SandboxPage({ params }: { params: Promise<{ sandboxId: string }> }) {
  const { sandboxId } = await params; const organization = await getCurrentOrganization();
  const rows = await query<{ id: string; name: string; slug: string; version: string; status: string; capability_count: string; imported_at: string }>(
    `SELECT s.id, s.name, s.slug, s.version, s.status, count(c.id)::text capability_count, p.created_at::text imported_at
     FROM sandboxes s JOIN projects p ON p.id = s.project_id LEFT JOIN capabilities c ON c.project_id = p.id AND c.enabled
     WHERE s.id = $1 AND p.organization_id = $2 GROUP BY s.id, p.created_at`, [sandboxId, organization.id]);
  if (!rows[0]) notFound();
  const receipts = await query<{ payload: Record<string, unknown>; signature: string }>(
    `SELECT r.payload, r.signature FROM receipts r JOIN executions e ON e.id = r.execution_id WHERE e.sandbox_id = $1 ORDER BY r.created_at DESC LIMIT 1`, [sandboxId]);
  const headerList = await headers(); const host = headerList.get("host") ?? "localhost:3000"; const protocol = host.includes("localhost") ? "http" : "https";
  return <VerificationConsole sandboxId={sandboxId} sandbox={rows[0]} initialReceipt={receipts[0] ? { ...receipts[0].payload, signature: receipts[0].signature } : null} origin={`${protocol}://${host}`} />;
}
