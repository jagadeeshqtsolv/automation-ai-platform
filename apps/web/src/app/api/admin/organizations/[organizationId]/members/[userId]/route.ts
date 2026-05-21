import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, requirePlatformAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
});

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ organizationId: string; userId: string }> },
) {
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
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const deleted = await prisma.organizationMember.deleteMany({
    where: {
      organizationId: parsedParams.data.organizationId,
      userId: parsedParams.data.userId,
    },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
