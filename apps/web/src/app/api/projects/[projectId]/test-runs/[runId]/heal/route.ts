import { NextResponse } from "next/server";
import { healTestRunBodySchema } from "@automation-ai/core";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { AI_NOT_CONFIGURED_MESSAGE } from "@/lib/project-ai-config";
import { healTestsFromRun } from "@/lib/test-execution/heal-tests-from-run";

const MAX_RUN_OUTPUT_CHARS = 500_000;

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
});

export async function POST(
  req: Request,
  context: { params: Promise<{ projectId: string; runId: string }> },
) {
  const raw = await context.params;
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const json: unknown = await req.json().catch(() => ({}));
  const bodyParsed = healTestRunBodySchema.safeParse(json);
  if (!bodyParsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await healTestsFromRun({
      projectId: parsed.data.projectId,
      runId: parsed.data.runId,
      problemDescription: bodyParsed.data.problemDescription,
    });

    const stamp = new Date().toISOString();
    console.info(
      `[heal] project=${parsed.data.projectId} run=${parsed.data.runId} model=${result.model} tests=${result.healedTestPaths.join(", ") || "(none)"} pageObjects=${result.healedPagePaths.join(", ") || "(none)"}`,
    );

    try {
      const row = await prisma.testRun.findFirst({
        where: { id: parsed.data.runId, projectId: parsed.data.projectId },
        select: { output: true },
      });
      if (row !== null) {
        const fileLines = result.changedFiles
          .map((f) => `  ${f.path}  (+${f.linesAdded} / -${f.linesRemoved} lines)`)
          .join("\n");
        const block =
          `\n\n--- auto-heal ${stamp} ---\n` +
          `model: ${result.model}\n` +
          `updated tests: ${result.healedTestPaths.length > 0 ? result.healedTestPaths.join(", ") : "(none)"}\n` +
          `updated page objects: ${result.healedPagePaths.length > 0 ? result.healedPagePaths.join(", ") : "(none)"}\n` +
          (fileLines.length > 0 ? `changes:\n${fileLines}\n` : "");
        const combined = `${row.output ?? ""}${block}`;
        const trimmed =
          combined.length > MAX_RUN_OUTPUT_CHARS
            ? combined.slice(-MAX_RUN_OUTPUT_CHARS)
            : combined;
        await prisma.testRun.update({
          where: { id: parsed.data.runId },
          data: { output: trimmed },
        });
      }
    } catch (appendErr) {
      console.warn("[heal] could not append heal summary to run output", appendErr);
    }

    return NextResponse.json({
      ok: true,
      healedTestPaths: result.healedTestPaths,
      healedPagePaths: result.healedPagePaths,
      model: result.model,
      changedFiles: result.changedFiles,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Heal failed";
    if (message === AI_NOT_CONFIGURED_MESSAGE) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
