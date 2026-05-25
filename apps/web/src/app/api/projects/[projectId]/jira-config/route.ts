import { NextResponse } from "next/server";
import { z } from "zod";
import { updateJiraConfigBodySchema } from "@automation-ai/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getJiraConfigView, saveJiraConfig } from "@/lib/jira-config";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const config = await getJiraConfigView(params.data.projectId).catch(() => null);
  if (!config) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ jira: config });
}

export async function PATCH(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => null);
  const parsed = updateJiraConfigBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  await saveJiraConfig(params.data.projectId, {
    baseUrl: parsed.data.baseUrl,
    email: parsed.data.email,
    apiToken: parsed.data.apiToken,
    defaultJql: parsed.data.defaultJql,
  });

  const config = await getJiraConfigView(params.data.projectId);
  return NextResponse.json({ jira: config });
}
