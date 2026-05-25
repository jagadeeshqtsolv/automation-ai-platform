import { NextResponse } from "next/server";
import { createInviteBodySchema } from "@automation-ai/core";
import { z } from "zod";
import { requireApiUser, requirePlatformAdmin } from "@/lib/auth/api-auth";
import type { OrgRole } from "@/lib/auth/access";
import { buildInviteRegisterUrl, createOrganizationInvite } from "@/lib/auth/invites";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  organizationId: z.string().uuid(),
});

export async function GET(_req: Request, context: { params: Promise<{ organizationId: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const adminCheck = await requirePlatformAdmin(auth.id);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid organization id" }, { status: 400 });
  }

  const invites = await prisma.organizationInvite.findMany({
    where: { organizationId: parsedParams.data.organizationId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      usedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    invites.map((i) => ({
      ...i,
      expiresAt: i.expiresAt.toISOString(),
      usedAt: i.usedAt?.toISOString() ?? null,
      createdAt: i.createdAt.toISOString(),
    })),
  );
}

export async function DELETE(_req: Request, context: { params: Promise<{ organizationId: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;

  const adminCheck = await requirePlatformAdmin(auth.id);
  if (adminCheck instanceof NextResponse) return adminCheck;

  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid organization id" }, { status: 400 });
  }

  const { count } = await prisma.organizationInvite.deleteMany({
    where: { organizationId: parsedParams.data.organizationId },
  });

  return NextResponse.json({ ok: true, deleted: count });
}

export async function POST(req: Request, context: { params: Promise<{ organizationId: string }> }) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const adminCheck = await requirePlatformAdmin(auth.id);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid organization id" }, { status: 400 });
  }

  const org = await prisma.organization.findUnique({
    where: { id: parsedParams.data.organizationId },
    select: { id: true },
  });
  if (org === null) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = createInviteBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser !== null) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        organizationId_userId: {
          organizationId: parsedParams.data.organizationId,
          userId: existingUser.id,
        },
      },
    });
    if (membership !== null) {
      return NextResponse.json({ error: "User is already a member of this organization" }, { status: 409 });
    }
  }

  const pending = await prisma.organizationInvite.findFirst({
    where: {
      organizationId: parsedParams.data.organizationId,
      email,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (pending !== null) {
    return NextResponse.json({ error: "A pending invite already exists for this email" }, { status: 409 });
  }

  const invite = await createOrganizationInvite({
    organizationId: parsedParams.data.organizationId,
    email,
    role: parsed.data.role as OrgRole,
    invitedById: auth.id,
  });

  const origin = new URL(req.url).origin;
  const inviteUrl = buildInviteRegisterUrl(origin, invite.token);

  return NextResponse.json(
    {
      id: invite.id,
      email,
      role: parsed.data.role,
      expiresAt: invite.expiresAt.toISOString(),
      inviteUrl,
    },
    { status: 201 },
  );
}
