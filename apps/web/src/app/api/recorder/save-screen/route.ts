import { NextResponse } from "next/server";
import {
  saveScreenFromDeviceBodySchema,
  saveWebPageFromBrowserBodySchema,
} from "@automation-ai/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { getProjectPlatformType } from "@/lib/project-platform";
import { savePageFromBrowser } from "@/lib/save-page-from-browser";
import { saveScreenFromDevice } from "@/lib/save-screen-from-device";
import { formatZodError } from "@/lib/zod-errors";

export async function POST(req: Request) {
  const json: unknown = await req.json().catch(() => null);

  const projectId =
    json !== null && typeof json === "object" && !Array.isArray(json)
      ? (json as Record<string, unknown>).projectId
      : undefined;
  if (typeof projectId !== "string") {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const platform = await getProjectPlatformType(projectId);

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, name: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    if (platform === "web") {
      const parsed = saveWebPageFromBrowserBodySchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
      }
      const result = await savePageFromBrowser({
        projectId: parsed.data.projectId,
        projectName: project.name,
        pageName: parsed.data.pageName,
        elements: parsed.data.elements,
        environmentId: parsed.data.environmentId,
        overwriteExisting: parsed.data.overwriteExisting ?? true,
      });
      return NextResponse.json(result, { status: 201 });
    }

    const parsed = saveScreenFromDeviceBodySchema.safeParse(json);
    if (!parsed.success) {
      return NextResponse.json({ error: formatZodError(parsed.error) }, { status: 400 });
    }
    const result = await saveScreenFromDevice({
      projectId: parsed.data.projectId,
      projectName: project.name,
      screenName: parsed.data.screenName,
      elements: parsed.data.elements,
      environmentId: parsed.data.environmentId,
      overwriteExisting: parsed.data.overwriteExisting ?? true,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not save page object";
    const status = message.includes("already exists") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
