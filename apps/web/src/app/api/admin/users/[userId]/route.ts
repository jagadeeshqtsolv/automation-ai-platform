import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiUser, requirePlatformAdmin } from "@/lib/auth/api-auth";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ userId: z.string().uuid() });

export async function DELETE(
  _req: Request,
  context: { params: Promise<{ userId: string }> },
) {
  const auth = await requireApiUser();
  if (auth instanceof NextResponse) return auth;

  const adminCheck = await requirePlatformAdmin(auth.id);
  if (adminCheck instanceof NextResponse) return adminCheck;

  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid user id" }, { status: 400 });
  }

  if (params.data.userId === auth.id) {
    return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.data.userId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  await prisma.user.delete({ where: { id: params.data.userId } });

  return NextResponse.json({ ok: true });
}
