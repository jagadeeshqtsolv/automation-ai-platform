import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getJiraCredentials } from "@/lib/jira-config";
import { testJiraConnection } from "@/lib/jira";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function POST(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const creds = await getJiraCredentials(params.data.projectId);
  if (!creds) {
    return NextResponse.json(
      { ok: false, error: "Jira is not fully configured. Save base URL, email, and API token first." },
      { status: 400 },
    );
  }

  const result = await testJiraConnection(creds.baseUrl, creds.email, creds.token);
  return NextResponse.json(result);
}
