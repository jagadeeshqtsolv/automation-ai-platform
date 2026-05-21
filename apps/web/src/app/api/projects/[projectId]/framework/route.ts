import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { syncProjectWorkspaceToDisk } from "@/lib/local-framework/sync-workspace-to-disk";
import { listFrameworkTree } from "@/lib/local-framework/writer";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  await syncProjectWorkspaceToDisk(parsed.data.projectId);
  const tree = await listFrameworkTree(parsed.data.projectId);
  return NextResponse.json(tree);
}
