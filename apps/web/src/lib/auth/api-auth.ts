import { NextResponse } from "next/server";
import type { AuthUser } from "@/lib/auth/current-user";
import { forbiddenResponse, getCurrentUser, unauthorizedResponse } from "@/lib/auth/current-user";
import { getOrganizationMembership, userCanAccessProject } from "@/lib/auth/access";
import { userIsPlatformAdmin } from "@/lib/auth/platform-admin";

export async function requireApiUser(): Promise<AuthUser | NextResponse> {
  const user = await getCurrentUser();
  if (user === null) {
    return unauthorizedResponse();
  }
  return user;
}

export async function requireOrgAccess(
  userId: string,
  organizationId: string,
): Promise<true | NextResponse> {
  const membership = await getOrganizationMembership(userId, organizationId);
  if (membership === null) {
    return forbiddenResponse();
  }
  if (membership.organization.disabled === true) {
    return NextResponse.json(
      { error: "This organization is disabled. Contact your platform administrator." },
      { status: 403 },
    );
  }
  return true;
}

export async function requireProjectAccess(
  userId: string,
  projectId: string,
): Promise<true | NextResponse> {
  const allowed = await userCanAccessProject(userId, projectId);
  if (!allowed) {
    return forbiddenResponse();
  }
  return true;
}

export async function requirePlatformAdmin(userId: string): Promise<true | NextResponse> {
  const isAdmin = await userIsPlatformAdmin(userId);
  if (!isAdmin) {
    return forbiddenResponse();
  }
  return true;
}
