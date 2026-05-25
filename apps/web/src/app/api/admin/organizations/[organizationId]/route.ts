import { NextResponse } from "next/server";
import { setOrganizationDisabledBodySchema } from "@automation-ai/core";
import { z } from "zod";
import { requireApiUser, requirePlatformAdmin } from "@/lib/auth/api-auth";
import { setOrganizationDisabled } from "@/lib/organizations/set-organization-disabled";

const paramsSchema = z.object({
  organizationId: z.string().uuid(),
});

export async function PATCH(
  req: Request,
  context: { params: Promise<{ organizationId: string }> },
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
    return NextResponse.json({ error: "Invalid organization id" }, { status: 400 });
  }

  const json: unknown = await req.json().catch(() => null);
  const parsedBody = setOrganizationDisabledBodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await setOrganizationDisabled(
    parsedParams.data.organizationId,
    parsedBody.data.disabled,
  );
  if (result === "not_found") {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  return NextResponse.json({
    ok: true,
    organizationId: parsedParams.data.organizationId,
    disabled: parsedBody.data.disabled,
  });
}
