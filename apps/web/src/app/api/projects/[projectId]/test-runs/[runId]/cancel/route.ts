import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { cancelActiveTestRun } from "@/lib/test-execution/active-test-run-process";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid(),
});

export async function POST(
  _req: Request,
  context: { params: Promise<{ projectId: string; runId: string }> },
) {
  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const run = await prisma.testRun.findFirst({
    where: { id: parsed.data.runId, projectId: parsed.data.projectId },
    select: { id: true, status: true, finishedAt: true },
  });

  if (run === null) {
    return NextResponse.json({ error: "Test run not found" }, { status: 404 });
  }

  if (run.status !== "running" || run.finishedAt !== null) {
    return NextResponse.json({ error: "Test run is not in progress" }, { status: 409 });
  }

  const stopped = cancelActiveTestRun(parsed.data.runId);
  if (!stopped) {
    const existing = await prisma.testRun.findUnique({
      where: { id: parsed.data.runId },
      select: { output: true },
    });
    await prisma.testRun.update({
      where: { id: parsed.data.runId },
      data: {
        status: "cancelled",
        finishedAt: new Date(),
        output: `${existing?.output ?? ""}\n[Test run stop requested — process already finished]\n`,
      },
    });
    return NextResponse.json({ ok: true, status: "cancelled" });
  }

  const existing = await prisma.testRun.findUnique({
    where: { id: parsed.data.runId },
    select: { output: true },
  });
  await prisma.testRun.update({
    where: { id: parsed.data.runId },
    data: {
      output: `${existing?.output ?? ""}\n[Stopping test run…]\n`,
    },
  });

  return NextResponse.json({ ok: true, status: "stopping" });
}
