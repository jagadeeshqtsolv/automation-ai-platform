import { NextResponse } from "next/server";
import { createOrganizationBodySchema } from "@automation-ai/core";
import { requireApiUser, requirePlatformAdmin } from "@/lib/auth/api-auth";
import { slugifyOrganizationName, uniqueOrganizationSlug } from "@/lib/auth/org-slug";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) {
    return auth;
  }

  const memberships = await prisma.organizationMember.findMany({
    where: { userId: auth.id, organization: { disabled: false } },
    orderBy: { createdAt: "asc" },
    select: {
      role: true,
      organization: {
        select: {
          id: true,
          name: true,
          slug: true,
          disabled: true,
          createdAt: true,
          _count: { select: { projects: true, members: true } },
        },
      },
    },
  });

  return NextResponse.json(
    memberships.map((m) => ({
      id: m.organization.id,
      name: m.organization.name,
      slug: m.organization.slug,
      createdAt: m.organization.createdAt.toISOString(),
      role: m.role,
      projectCount: m.organization._count.projects,
      memberCount: m.organization._count.members,
      disabled: m.organization.disabled === true,
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
