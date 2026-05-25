import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { decryptAccessKey, parseExecutionConfigDocument } from "@/lib/execution-config";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ projectId: z.string().uuid() });

const bodySchema = z.object({
  username: z.string().min(1).max(200).optional(),
  accessKey: z.string().min(1).max(256).optional(),
});

type TestResult = { ok: boolean; plan?: string; parallelSessions?: number; error?: string };

async function testBrowserStackCredentials(username: string, accessKey: string): Promise<TestResult> {
  const auth = Buffer.from(`${username}:${accessKey}`).toString("base64");
  try {
    const res = await fetch("https://api.browserstack.com/automate/plan.json", {
      headers: { Authorization: `Basic ${auth}`, Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 401) {
      return { ok: false, error: "Invalid username or access key." };
    }
    if (!res.ok) {
      return { ok: false, error: `BrowserStack returned HTTP ${res.status}.` };
    }
    const body = (await res.json()) as {
      automate_plan?: string;
      team_parallel_sessions_max_allowed?: number;
    };
    return {
      ok: true,
      plan: body.automate_plan,
      parallelSessions: body.team_parallel_sessions_max_allowed,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Connection failed";
    return { ok: false, error: msg };
  }
}

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const rawParams = paramsSchema.safeParse(await context.params);
  if (!rawParams.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(rawParams.data.projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  let { username, accessKey } = parsed.data;

  // Fall back to saved credentials when the caller omits them
  if (!username || !accessKey) {
    const project = await prisma.project.findUnique({
      where: { id: rawParams.data.projectId },
      select: { executionConfigJson: true },
    });
    const doc = parseExecutionConfigDocument(project?.executionConfigJson);
    const savedUser = doc.config.browserstack?.username;
    const savedKey  = doc.secrets.browserstackAccessKeyEnc
      ? decryptAccessKey(doc.secrets.browserstackAccessKeyEnc)
      : null;

    username  = username  ?? savedUser;
    accessKey = accessKey ?? savedKey ?? undefined;
  }

  if (!username || !accessKey) {
    return NextResponse.json(
      { ok: false, error: "Provide username and access key, or save them first." },
      { status: 400 },
    );
  }

  const result = await testBrowserStackCredentials(username, accessKey);
  return NextResponse.json(result);
}
