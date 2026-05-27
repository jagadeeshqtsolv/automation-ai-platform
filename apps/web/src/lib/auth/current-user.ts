import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionFromCookies } from "@/lib/auth/session";

export type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin: boolean;
};

export async function getCurrentUser(): Promise<AuthUser | null> {
  const session = await getSessionFromCookies();
  if (session === null) {
    return null;
  }
  return getUserById(session.userId);
}

export async function getUserById(userId: string): Promise<AuthUser | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, isPlatformAdmin: true },
  });
  return user;
}

export async function requireUser(): Promise<AuthUser | null> {
  const session = await getSessionFromCookies();
  if (session === null) {
    return null;
  }
  return getUserById(session.userId);
}

export function unauthorizedResponse(): NextResponse {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbiddenResponse(): NextResponse {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
