import { NextResponse } from "next/server";
import { z } from "zod";
import { fetchJiraStoriesBodySchema } from "@automation-ai/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getJiraCredentials } from "@/lib/jira-config";
import { fetchJiraStories } from "@/lib/jira";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => null);
  const parsed = fetchJiraStoriesBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  const creds = await getJiraCredentials(params.data.projectId);
  if (!creds) {
    return NextResponse.json(
      { error: "Jira is not configured for this project. Add credentials in Setup → Jira." },
      { status: 400 },
    );
  }

  try {
    const stories = await fetchJiraStories(
      creds.baseUrl,
      creds.email,
      creds.token,
      parsed.data.jql,
      parsed.data.maxResults ?? 50,
    );
    return NextResponse.json({ stories });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to fetch stories from Jira";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
