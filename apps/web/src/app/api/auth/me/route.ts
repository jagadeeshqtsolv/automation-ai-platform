import { NextResponse } from "next/server";
import { requireApiUser } from "@/lib/auth/api-auth";
import { userIsPlatformAdmin } from "@/lib/auth/platform-admin";
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
        select: { id: true, name: true, slug: true, disabled: true, createdAt: true },
      },
    },
  });

  const isPlatformAdmin = await userIsPlatformAdmin(auth.id);

  return NextResponse.json({
    user: { ...auth, isPlatformAdmin },
    organizations: memberships.map((m) => ({
      ...m.organization,
      role: m.role,
    })),
  });
}
