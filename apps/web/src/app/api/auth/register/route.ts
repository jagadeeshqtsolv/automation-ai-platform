import { NextResponse } from "next/server";
import { registerBodySchema } from "@jagadeeshqtsolv/core";
import { hashPassword } from "@/lib/auth/password";
import { createSessionToken, sessionCookieOptions } from "@/lib/auth/session";
import { findValidInvite } from "@/lib/auth/invites";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const json: unknown = await req.json().catch(() => null);
  const parsed = registerBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const invite = await findValidInvite(parsed.data.inviteToken.trim());
  if (invite === null) {
    return NextResponse.json({ error: "Invite is invalid or expired" }, { status: 400 });
  }

  const email = parsed.data.email.trim().toLowerCase();
  if (email !== invite.email) {
    return NextResponse.json(
      { error: "Email must match the address on your invitation" },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser !== null) {
    return NextResponse.json({ error: "An account with this email already exists" }, { status: 409 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.$transaction(async (tx) => {
    const created = await tx.user.create({
      data: {
        email,
        passwordHash,
        name: parsed.data.name?.trim() ?? null,
        organizationMemberships: {
          create: {
            organizationId: invite.organizationId,
            role: invite.role,
          },
        },
      },
      select: { id: true, email: true, name: true },
    });

    await tx.organizationInvite.update({
      where: { id: invite.id },
      data: { usedAt: new Date() },
    });

    return created;
  });

  const sessionToken = await createSessionToken(user.id);
  const response = NextResponse.json(
    {
      user: { id: user.id, email: user.email, name: user.name },
      organization: {
        id: invite.organization.id,
        name: invite.organization.name,
        slug: invite.organization.slug,
      },
    },
    { status: 201 },
  );
  response.cookies.set(sessionCookieOptions(sessionToken));
  return response;
}
