import { requireAdminUserId } from "@/lib/auth";
import { query } from "@/lib/db";
import { z } from "zod";

const schema = z.object({ status: z.enum(["applied","qualified","onboarding","active","committed","declined"]) });
export async function PATCH(request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  await requireAdminUserId();
  try { const { applicationId } = await params; const input = schema.parse(await request.json()); const rows = await query<{ id: string }>("UPDATE design_partner_applications SET status=$1,updated_at=now() WHERE id=$2 RETURNING id", [input.status, applicationId]); if (!rows[0]) return Response.json({ error: "Application not found" }, { status: 404 }); return Response.json({ updated: true }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Update failed" }, { status: 400 }); }
}
