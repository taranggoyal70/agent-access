export function GET() {
  return Response.json({ status: "ok", service: "agent-access", version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "development" });
}
