import { prisma } from "@/lib/prisma";

export type OrgRole = "owner" | "member";

export async function getOrganizationMembership(userId: string, organizationId: string) {
  return prisma.organizationMember.findUnique({
    where: {
      organizationId_userId: { organizationId, userId },
    },
    include: {
      organization: { select: { disabled: true } },
    },
  });
}

export async function userCanAccessOrganization(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const membership = await getOrganizationMembership(userId, organizationId);
  if (membership === null || membership.organization.disabled === true) {
    return false;
  }
  return true;
}

/** Org owners always access projects; otherwise open project or explicit ProjectMember. */
export async function userCanAccessProject(userId: string, projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      organizationId: true,
      organization: { select: { disabled: true } },
    },
  });
  if (project === null || project.organization.disabled === true) {
    return false;
  }

  const orgMembership = await getOrganizationMembership(userId, project.organizationId);
  if (orgMembership === null) {
    return false;
  }
  if (orgMembership.role === "owner") {
    return true;
  }

  const restrictedCount = await prisma.projectMember.count({
    where: { projectId },
  });
  if (restrictedCount === 0) {
    return true;
  }

  const projectMembership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
  });
  return projectMembership !== null;
}

export async function getAccessibleProject(
  userId: string,
  projectId: string,
): Promise<{ id: string; name: string; organizationId: string; createdAt: Date } | null> {
  const allowed = await userCanAccessProject(userId, projectId);
  if (!allowed) {
    return null;
  }
  return prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true, organizationId: true, createdAt: true },
  });
}

export async function listAccessibleProjectIds(
  userId: string,
  organizationId: string,
): Promise<string[]> {
  const orgMembership = await getOrganizationMembership(userId, organizationId);
  if (orgMembership === null || orgMembership.organization.disabled === true) {
    return [];
  }

  const projects = await prisma.project.findMany({
    where: { organizationId },
    select: {
      id: true,
      members: { select: { userId: true } },
    },
  });

  if (orgMembership.role === "owner") {
    return projects.map((p) => p.id);
  }

  return projects
    .filter((p) => {
      if (p.members.length === 0) {
        return true;
      }
      return p.members.some((m) => m.userId === userId);
    })
    .map((p) => p.id);
}
