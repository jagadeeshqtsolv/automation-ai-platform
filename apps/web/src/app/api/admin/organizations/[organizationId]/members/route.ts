import { NextResponse } from "next/server";
import { assignMemberBodySchema } from "@automation-ai/core";
import { z } from "zod";
import { requireApiUser, requirePlatformAdmin } from "@/lib/auth/api-auth";
import type { OrgRole } from "@/lib/auth/access";
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

  const members = await prisma.organizationMember.findMany({
    where: { organizationId: parsedParams.data.organizationId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: { id: true, email: true, name: true } },
    },
  });

  return NextResponse.json(
    members.map((m) => ({
      id: m.id,
      role: m.role,
      createdAt: m.createdAt.toISOString(),
      user: m.user,
    })),
  );
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
  const parsed = assignMemberBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true },
  });
  if (user === null) {
    return NextResponse.json(
      { error: "No account exists for this email. Send an invite instead." },
      { status: 404 },
    );
  }

  const membership = await prisma.organizationMember.upsert({
    where: {
      organizationId_userId: {
        organizationId: parsedParams.data.organizationId,
        userId: user.id,
      },
    },
    create: {
      organizationId: parsedParams.data.organizationId,
      userId: user.id,
      role: parsed.data.role as OrgRole,
    },
    update: {
      role: parsed.data.role as OrgRole,
    },
    select: {
      id: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json(
    {
      id: membership.id,
      role: membership.role,
      createdAt: membership.createdAt.toISOString(),
      user,
    },
    { status: 201 },
  );
}
