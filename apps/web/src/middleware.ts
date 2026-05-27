import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken, SESSION_COOKIE } from "@/lib/auth/session-token";

const PUBLIC_PAGE_PATHS = new Set(["/", "/get-started", "/login", "/register"]);

const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/auth/register", "/api/auth/invite"];

// Routes that carry their own token-based auth and must be reachable without a session
// (e.g. called by GitHub Actions / external CI runners).
const PUBLIC_API_PATTERNS = [
  /^\/api\/projects\/[0-9a-f-]+\/pipeline-callback(\/.*)?$/,
];

function isPublicApi(pathname: string): boolean {
  return (
    PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)) ||
    PUBLIC_API_PATTERNS.some((pattern) => pattern.test(pathname))
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PAGE_PATHS.has(pathname) || isPublicApi(pathname)) {
    return NextResponse.next();
  }

  const session = await parseSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session === null) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/projects/:path*", "/admin/:path*", "/api/:path*"],
};
