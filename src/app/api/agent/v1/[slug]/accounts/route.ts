import { registerSandboxAgent } from "@/lib/registration";
import { z } from "zod";

const registrationSchema = z.object({ name: z.string().min(1).max(80), requested_capabilities: z.array(z.string()).max(50).optional() });

export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await params;
    const body = registrationSchema.parse(await request.json());
    const clientAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? request.headers.get("x-real-ip") ?? "unknown";
    const registration = await registerSandboxAgent(slug, body.name, body.requested_capabilities, clientAddress);
    return Response.json({ ...registration, warning: "The credential is shown once. Store it securely." }, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Registration failed" }, { status: 400 });
  }
}
