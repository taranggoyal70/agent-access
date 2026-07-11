import { query } from "@/lib/db";
import { hashSecret } from "@/lib/ids";
import { z } from "zod";

const schema = z.object({
  companyName: z.string().min(2).max(120),
  contactName: z.string().min(2).max(120),
  workEmail: z.string().email().max(200),
  roleTitle: z.string().min(2).max(120),
  companyUrl: z.string().url().max(500),
  apiSpecUrl: z.union([z.string().url().max(1000), z.literal("")]).optional(),
  agentDemand: z.enum(["customer_requests", "active_build", "exploring", "none"]),
  targetWorkflow: z.string().min(20).max(2000),
  timeline: z.enum(["this_week", "this_month", "this_quarter", "researching"]),
  website: z.string().max(0).optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
    const clientHash = hashSecret(address);
    const recent = await query<{ count: string }>("SELECT count(*)::text count FROM design_partner_applications WHERE client_hash=$1 AND created_at > now()-interval '24 hours'", [clientHash]);
    if (Number(recent[0].count) >= 5) return Response.json({ error: "Application limit reached. Please try again tomorrow." }, { status: 429 });
    const duplicate = await query<{ id: string }>("SELECT id FROM design_partner_applications WHERE lower(work_email)=lower($1) AND created_at > now()-interval '30 days' LIMIT 1", [input.workEmail]);
    if (duplicate[0]) return Response.json({ received: true });
    const rows = await query<{ id: string }>(
      `INSERT INTO design_partner_applications (company_name,contact_name,work_email,role_title,company_url,api_spec_url,agent_demand,target_workflow,timeline,client_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
      [input.companyName, input.contactName, input.workEmail, input.roleTitle, input.companyUrl, input.apiSpecUrl || null, input.agentDemand, input.targetWorkflow, input.timeline, clientHash],
    );
    return Response.json({ received: true, applicationId: rows[0].id }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Application failed" }, { status: 400 }); }
}
