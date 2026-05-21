import { access, cp, rm } from "node:fs/promises";
import path from "node:path";
import type { RunTestsParams } from "@/lib/test-execution/run-tests";
import { runProjectTests } from "@/lib/test-execution/run-tests";
import { loadPlaywrightReportAnalysis } from "@/lib/test-execution/playwright-report-analysis";
import { PLAYWRIGHT_HTML_REPORT_DIR } from "@/lib/test-execution/playwright-html-report";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";

const FLUSH_MS = 400;
const MAX_OUTPUT_CHARS = 500_000;

async function archiveHtmlReportSnapshot(projectId: string, runId: string): Promise<string | null> {
  const rel = `logs/reports/${runId}`;
  const dest = resolveFrameworkFilePath(projectId, rel);
  const src = path.join(getProjectFrameworkRoot(projectId), PLAYWRIGHT_HTML_REPORT_DIR);
  if (dest === null) {
    return null;
  }
  try {
    await access(path.join(src, "index.html"));
  } catch {
    return null;
  }
  try {
    await rm(dest, { recursive: true, force: true });
    await cp(src, dest, { recursive: true });
    return rel;
  } catch {
    return null;
  }
}

function trimOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) {
    return text;
  }
  return text.slice(-MAX_OUTPUT_CHARS);
}

export async function executeTestRunInBackground(runId: string, params: RunTestsParams): Promise<void> {
  let output = "Starting test run…\n";
  let command = "";
  let lastFlush = Date.now();
  let flushChain: Promise<void> = Promise.resolve();

  const scheduleFlush = (): void => {
    const now = Date.now();
    if (now - lastFlush < FLUSH_MS) {
      return;
    }
    lastFlush = now;
    const snapshot = output;
    const snapshotCommand = command;
    flushChain = flushChain.then(async () => {
      await prisma.testRun.update({
        where: { id: runId },
        data: {
          output: snapshot,
          ...(snapshotCommand.length > 0 ? { command: snapshotCommand } : {}),
        },
      });
    });
  };

  const onLog = (chunk: string): void => {
    output = trimOutput(output + chunk);
    scheduleFlush();
  };

  try {
    await prisma.testRun.update({
      where: { id: runId },
      data: { status: "running", output, finishedAt: null, exitCode: null },
    });

    const result = await runProjectTests(params, { onLog }, { runId });
    command = result.command;
    output = trimOutput(
      result.output.length > 0 ? result.output : output,
    );

    const status = result.cancelled
      ? "cancelled"
      : result.ok
        ? "passed"
        : result.exitCode === null
          ? "error"
          : "failed";

    await flushChain;
    const analysis = await loadPlaywrightReportAnalysis(params.projectId);
    const htmlReportRel = await archiveHtmlReportSnapshot(params.projectId, runId);
    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status,
        exitCode: result.exitCode,
        output,
        command: result.command,
        finishedAt: new Date(),
        ...(analysis !== null ? { resultsAnalysis: analysis as unknown as Prisma.InputJsonValue } : {}),
        ...(htmlReportRel !== null ? { htmlReportRel } : {}),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Test run failed";
    output = trimOutput(`${output}\n${message}\n`);
    await flushChain;
    const analysis = await loadPlaywrightReportAnalysis(params.projectId).catch(() => null);
    const htmlReportRel = await archiveHtmlReportSnapshot(params.projectId, runId);
    await prisma.testRun.update({
      where: { id: runId },
      data: {
        status: "error",
        exitCode: null,
        output,
        command,
        finishedAt: new Date(),
        ...(analysis !== null ? { resultsAnalysis: analysis as unknown as Prisma.InputJsonValue } : {}),
        ...(htmlReportRel !== null ? { htmlReportRel } : {}),
      },
    });
  }
}
