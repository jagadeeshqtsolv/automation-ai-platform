import { NextResponse } from "next/server";
import { createOrganizationBodySchema } from "@jagadeeshqtsolv/core";
import { requireApiUser, requirePlatformAdmin } from "@/lib/auth/api-auth";
import { slugifyOrganizationName, uniqueOrganizationSlug } from "@/lib/auth/org-slug";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const adminCheck = await requirePlatformAdmin(auth.id);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      slug: true,
      disabled: true,
      createdAt: true,
      _count: { select: { members: true, projects: true, invites: true } },
    },
  });

  return NextResponse.json(
    orgs.map((o) => ({
      id: o.id,
      name: o.name,
      slug: o.slug,
      disabled: o.disabled === true,
      createdAt: o.createdAt.toISOString(),
      memberCount: o._count.members,
      projectCount: o._count.projects,
      pendingInviteCount: o._count.invites,
    })),
  );
}

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const adminCheck = await requirePlatformAdmin(auth.id);
  if (adminCheck instanceof NextResponse) {
    return adminCheck;
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = createOrganizationBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const baseSlug = slugifyOrganizationName(parsed.data.name);
  const slug = await uniqueOrganizationSlug(baseSlug, async (candidate) => {
    const row = await prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    return row !== null;
  });

  const org = await prisma.organization.create({
    data: {
      name: parsed.data.name.trim(),
      slug,
      disabled: false,
    },
    select: { id: true, name: true, slug: true, disabled: true, createdAt: true },
  });

  return NextResponse.json(
    { ...org, disabled: false, createdAt: org.createdAt.toISOString() },
    { status: 201 },
  );
}
