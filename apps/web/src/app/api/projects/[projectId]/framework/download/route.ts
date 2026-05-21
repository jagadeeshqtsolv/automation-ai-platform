import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import {
  createFrameworkZipBuffer,
  frameworkZipDownloadName,
} from "@/lib/local-framework/archive-framework";
import { syncProjectWorkspaceToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  await syncProjectWorkspaceToDisk(parsedParams.data.projectId);

  let zip: Buffer;
  try {
    zip = await createFrameworkZipBuffer(parsedParams.data.projectId);
  } catch {
    return NextResponse.json({ error: "Framework not found on disk" }, { status: 404 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { name: true },
  });

  const filename = frameworkZipDownloadName(parsedParams.data.projectId, project?.name);

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(zip.length),
      "Cache-Control": "no-store",
    },
  });
}
