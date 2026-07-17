import { clerkMiddleware } from "@clerk/nextjs/server";

const publicPrefixes = ["/sign-in", "/sign-up", "/docs", "/design-partner", "/api/health", "/api/design-partner", "/api/agent", "/api/receipts", "/mcp", "/.well-known"];

export default clerkMiddleware(async (auth, request) => {
  const path = request.nextUrl.pathname;
  if (path === "/" || path.startsWith("/__clerk/") || publicPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return;
  await auth.protect();
});

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)", "/__clerk/(.*)"],
};
