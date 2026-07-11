import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse, type NextFetchEvent, type NextRequest } from "next/server";

const publicPrefixes = ["/sign-in", "/sign-up", "/docs", "/design-partner", "/api/health", "/api/design-partner", "/api/agent", "/api/receipts", "/mcp", "/.well-known"];
const protect = clerkMiddleware(async (auth) => { await auth.protect(); });

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  const path = request.nextUrl.pathname;
  if (path === "/" || publicPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return NextResponse.next();
  return protect(request, event);
}

export const config = {
  matcher: ["/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)", "/(api|trpc)(.*)"],
};
