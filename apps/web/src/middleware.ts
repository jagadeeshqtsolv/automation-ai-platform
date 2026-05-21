import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { parseSessionToken, SESSION_COOKIE } from "@/lib/auth/session-token";

const PUBLIC_PAGE_PATHS = new Set(["/", "/get-started", "/login", "/register"]);

const PUBLIC_API_PREFIXES = ["/api/auth/login", "/api/auth/register", "/api/auth/invite"];

function isPublicApi(pathname: string): boolean {
  return PUBLIC_API_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
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
