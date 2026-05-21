import { NextResponse } from "next/server";
import { findValidInvite } from "@/lib/auth/invites";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token")?.trim() ?? "";

  if (token.length === 0) {
    return NextResponse.json({ error: "Invite token is required" }, { status: 400 });
  }

  const invite = await findValidInvite(token);
  if (invite === null) {
    return NextResponse.json({ error: "Invite is invalid or expired" }, { status: 404 });
  }

  return NextResponse.json({
    email: invite.email,
    role: invite.role,
    expiresAt: invite.expiresAt.toISOString(),
    organization: {
      id: invite.organization.id,
      name: invite.organization.name,
      slug: invite.organization.slug,
    },
  });
}
