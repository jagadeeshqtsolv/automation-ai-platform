import { randomBytes } from "node:crypto";
import type { OrgRole } from "@/lib/auth/access";
import { prisma } from "@/lib/prisma";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createInviteToken(): string {
  return randomBytes(32).toString("hex");
}

export async function findValidInvite(token: string) {
  const invite = await prisma.organizationInvite.findUnique({
    where: { token },
    include: {
      organization: { select: { id: true, name: true, slug: true } },
    },
  });
  if (invite === null) {
    return null;
  }
  if (invite.usedAt !== null) {
    return null;
  }
  if (invite.expiresAt.getTime() < Date.now()) {
    return null;
  }
  return invite;
}

export async function createOrganizationInvite(params: {
  organizationId: string;
  email: string;
  role: OrgRole;
  invitedById: string;
}): Promise<{ id: string; token: string; expiresAt: Date }> {
  const email = params.email.trim().toLowerCase();
  const token = createInviteToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS);

  const row = await prisma.organizationInvite.create({
    data: {
      token,
      organizationId: params.organizationId,
      email,
      role: params.role,
      invitedById: params.invitedById,
      expiresAt,
    },
    select: { id: true, token: true, expiresAt: true },
  });

  return row;
}

export function buildInviteRegisterUrl(origin: string, token: string): string {
  const url = new URL("/register", origin);
  url.searchParams.set("invite", token);
  return url.toString();
}
