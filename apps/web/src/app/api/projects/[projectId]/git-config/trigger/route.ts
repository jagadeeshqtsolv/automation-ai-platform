import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { triggerPipelineBodySchema } from "@jagadeeshqtsolv/core";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectGitConfigView, getProjectCiToken, getProjectCiConfigView } from "@/lib/project-git/git-config";
import { getUserGitConfigView } from "@/lib/project-git/user-git-config";
import { triggerCiPipeline, findLatestGitHubRunUrl } from "@/lib/project-git/trigger-pipeline";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ projectId: z.string().uuid() });

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const { projectId } = params.data;
  const guard = await withAuthAndProject(projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => null);
  const parsed = triggerPipelineBodySchema.safeParse(json);
  if (!parsed.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  // Reject if a run is already in progress
  const running = await prisma.testRun.findFirst({
    where: { projectId, status: "running", finishedAt: null },
    select: { id: true },
  });
  if (running) {
    return NextResponse.json(
      { error: "A test run is already in progress", runId: running.id },
      { status: 409 },
    );
  }

  const [gitConfig, ciConfig, userGit] = await Promise.all([
    getProjectGitConfigView(projectId),
    getProjectCiConfigView(projectId),
    getUserGitConfigView(projectId, guard.user.id),
  ]);

  if (!gitConfig?.remoteUrl) {
    return NextResponse.json(
      { error: "No repository URL configured. Set it in Setup → Git." },
      { status: 422 },
    );
  }
  if (!ciConfig?.hasCiToken) {
    return NextResponse.json(
      { error: "No CI token configured. Set it in Setup → Execution → GitHub CI." },
      { status: 422 },
    );
  }

  const branch = userGit?.branch ?? gitConfig.baseBranch;
  if (!branch) {
    return NextResponse.json(
      { error: "No branch configured. Set your working branch in Setup → Git." },
      { status: 422 },
    );
  }

  const ciToken = await getProjectCiToken(projectId);
  if (!ciToken) {
    return NextResponse.json({ error: "Could not decrypt CI token" }, { status: 500 });
  }

  // Resolve environment slug
  let environmentSlug = "";
  if (parsed.data.environmentId) {
    const env = await prisma.environment.findFirst({
      where: { id: parsed.data.environmentId, projectId },
      select: { slug: true },
    });
    environmentSlug = env?.slug ?? "";
  }

  // Create the TestRun record so polling works immediately
  const callbackToken = randomBytes(32).toString("hex");
  const run = await prisma.testRun.create({
    data: {
      projectId,
      provider: "ci",
      status: "running",
      specPaths: JSON.stringify(parsed.data.specPaths),
      environmentId: parsed.data.environmentId ?? null,
      output: `Triggering CI pipeline on branch "${branch}"…\n`,
      callbackToken,
    },
    select: { id: true },
  });

  // Build the callback URL.
  // Priority: NEXT_PUBLIC_APP_URL env var > request origin (fallback)
  const reqUrl = new URL(req.url);
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? `${reqUrl.protocol}//${reqUrl.host}`;
  const callbackUrl = `${origin}/api/projects/${projectId}/pipeline-callback?token=${callbackToken}`;

  const result = await triggerCiPipeline({
    remoteUrl: gitConfig.remoteUrl,
    ciToken,
    workflowFile: ciConfig.workflowFile,
    branch,
    inputs: {
      spec_paths: parsed.data.specPaths.join(" "),
      environment: environmentSlug,
      grep: parsed.data.grep ?? "",
      callback_url: callbackUrl,
      run_id: run.id,
    },
  });

  if (!result.ok) {
    // Mark run as error immediately so the poller doesn't hang
    await prisma.testRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        output: `Failed to trigger CI pipeline: ${result.error}\n`,
        finishedAt: new Date(),
      },
    });
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  await prisma.testRun.update({
    where: { id: run.id },
    data: {
      output:
        `CI pipeline triggered on branch "${branch}".\n` +
        `Callback origin: ${origin}\n` +
        `Waiting for pipeline to report results…\n`,
    },
  });

  // ── For GitHub: poll API in the background to get the Actions run URL ────────
  // workflow_dispatch returns 204 with no body, so we poll to find the run.
  // This fires-and-forgets — the response is returned immediately.
  if (gitConfig.remoteUrl.toLowerCase().includes("github.com")) {
    const triggeredAt = new Date();
    const runId = run.id;
    const remoteUrl = gitConfig.remoteUrl;
    const workflowFile = ciConfig.workflowFile;
    void (async () => {
      // GitHub takes a few seconds to create the run — start polling after 5s
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise<void>((r) => setTimeout(r, attempt === 0 ? 5_000 : 3_000));
        try {
          const runUrl = await findLatestGitHubRunUrl({
            remoteUrl,
            ciToken,
            workflowFile,
            branch,
            triggeredAt,
          });
          if (runUrl !== null) {
            await prisma.testRun.update({
              where: { id: runId },
              data: { pipelineUrl: runUrl },
            });
            return;
          }
        } catch {
          // non-fatal — keep trying
        }
      }
    })();
  }

  return NextResponse.json({ runId: run.id, status: "running" }, { status: 202 });
}
