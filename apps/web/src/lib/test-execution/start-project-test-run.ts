import { decryptAccessKey, parseExecutionConfigDocument } from "@/lib/execution-config";
import { executeTestRunInBackground } from "@/lib/test-execution/execute-test-run";
import { listTestSpecFiles } from "@/lib/test-execution/list-test-specs";
import { buildRerunFailuresParams } from "@/lib/test-execution/rerun-params";
import { prisma } from "@/lib/prisma";

export type StartTestRunResult =
  | { ok: true; runId: string }
  | { ok: false; error: string; runId?: string };

export async function startProjectTestRun(params: {
  projectId: string;
  specPaths?: string[];
  environmentId?: string | null;
  grep?: string;
}): Promise<StartTestRunResult> {
  const running = await prisma.testRun.findFirst({
    where: { projectId: params.projectId, status: "running", finishedAt: null },
    select: { id: true },
  });
  if (running !== null) {
    return {
      ok: false,
      error: "A test run is already in progress.",
      runId: running.id,
    };
  }

  const specPaths =
    params.specPaths !== undefined && params.specPaths.length > 0
      ? params.specPaths
      : (await listTestSpecFiles(params.projectId)).map((s) => s.path);

  if (specPaths.length === 0) {
    return { ok: false, error: "No test spec files found under tests/." };
  }

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { executionConfigJson: true },
  });
  if (project === null) {
    return { ok: false, error: "Project not found." };
  }

  let environmentConfigJson: string | null = null;
  if (params.environmentId !== undefined && params.environmentId !== null) {
    const env = await prisma.environment.findFirst({
      where: { id: params.environmentId, projectId: params.projectId },
      select: { configJson: true },
    });
    if (env === null) {
      return { ok: false, error: "Environment not found." };
    }
    environmentConfigJson = env.configJson;
  } else {
    const defaultEnv = await prisma.environment.findFirst({
      where: { projectId: params.projectId },
      orderBy: { slug: "asc" },
      select: { configJson: true },
    });
    environmentConfigJson = defaultEnv?.configJson ?? null;
  }

  const doc = parseExecutionConfigDocument(project.executionConfigJson);

  const run = await prisma.testRun.create({
    data: {
      projectId: params.projectId,
      provider: doc.config.provider,
      status: "running",
      specPaths: JSON.stringify(specPaths),
      environmentId: params.environmentId ?? null,
      output: "Queued test run…\n",
    },
    select: { id: true },
  });

  const runParams = {
    projectId: params.projectId,
    config: doc.config,
    environmentConfigJson,
    secrets: {
      saucelabsAccessKey: decryptAccessKey(doc.secrets.saucelabsAccessKeyEnc),
      browserstackAccessKey: decryptAccessKey(doc.secrets.browserstackAccessKeyEnc),
      lambdatestAccessKey: decryptAccessKey(doc.secrets.lambdatestAccessKeyEnc),
    },
    specPaths,
    grep: params.grep,
  };

  void executeTestRunInBackground(run.id, runParams).catch((err: unknown) => {
    const message = err instanceof Error ? err.message : "Background test run failed";
    console.error(`[test-run ${run.id}]`, message);
    void prisma.testRun.update({
      where: { id: run.id },
      data: {
        status: "error",
        output: `${message}\n`,
        finishedAt: new Date(),
      },
    });
  });

  return { ok: true, runId: run.id };
}

export async function startRerunFailuresForProject(projectId: string): Promise<StartTestRunResult> {
  const last = await prisma.testRun.findFirst({
    where: { projectId, finishedAt: { not: null } },
    orderBy: { createdAt: "desc" },
    select: {
      specPaths: true,
      environmentId: true,
      resultsAnalysis: true,
    },
  });

  if (last === null) {
    return { ok: false, error: "No completed test runs yet." };
  }

  const specPaths = JSON.parse(last.specPaths) as string[];
  const built = buildRerunFailuresParams({
    specPaths,
    environmentId: last.environmentId,
    resultsAnalysis: last.resultsAnalysis as Parameters<typeof buildRerunFailuresParams>[0]["resultsAnalysis"],
  });

  if (!built.ok) {
    return {
      ok: false,
      error:
        built.reason === "no_analysis"
          ? "Last run has no failure analysis — try “run all” instead."
          : "No failed tests in the last run.",
    };
  }

  return startProjectTestRun({
    projectId,
    specPaths: built.params.specPaths,
    environmentId: built.params.environmentId,
    grep: built.params.grep,
  });
}
