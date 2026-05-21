import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import {
  createSessionToken,
  parseSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  type SessionPayload,
} from "@/lib/auth/session-token";

export {
  createSessionToken,
  parseSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  type SessionPayload,
};

export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const jar = await cookies();
  return parseSessionToken(jar.get(SESSION_COOKIE)?.value);
}

export async function getSessionFromRequest(request: NextRequest): Promise<SessionPayload | null> {
  return parseSessionToken(request.cookies.get(SESSION_COOKIE)?.value);
}

export function sessionCookieOptions(token: string): {
  name: string;
  value: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "lax";
  path: string;
  maxAge: number;
} {
  return {
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  };
}
