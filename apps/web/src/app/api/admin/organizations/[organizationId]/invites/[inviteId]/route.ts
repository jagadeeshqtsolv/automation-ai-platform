import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, requirePlatformAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  organizationId: z.string().uuid(),
  inviteId: z.string().uuid(),
});

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ organizationId: string; inviteId: string }> },
) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;

  const adminCheck = await requirePlatformAdmin(auth.id);
  if (adminCheck instanceof NextResponse) return adminCheck;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const deleted = await prisma.organizationInvite.deleteMany({
    where: {
      id: params.data.inviteId,
      organizationId: params.data.organizationId,
    },
  });

  if (deleted.count === 0) {
    return NextResponse.json({ error: "Invite not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
