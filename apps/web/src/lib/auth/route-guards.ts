import { NextResponse } from "next/server";
import type { AuthUser } from "@/lib/auth/current-user";
import { requireApiUser, requireProjectAccess } from "@/lib/auth/api-auth";

type AuthOk = { user: AuthUser };
type AuthFail = { error: NextResponse };

export async function withAuthenticatedUser(): Promise<AuthOk | AuthFail> {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return { error: auth };
  }
  return { user: auth };
}

export async function withProjectAccess(
  userId: string,
  projectId: string,
): Promise<true | NextResponse> {
  return requireProjectAccess(userId, projectId);
}

export async function withAuthAndProject(
  projectId: string,
): Promise<(AuthOk & { projectId: string }) | AuthFail> {
  const session = await withAuthenticatedUser();
  if ("error" in session) {
    return session;
  }
  const access = await withProjectAccess(session.user.id, projectId);
  if (access instanceof NextResponse) {
    return { error: access };
  }
  return { user: session.user, projectId };
}

