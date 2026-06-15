/**
 * Downloads a Playwright HTML report artifact from GitHub Actions and saves it
 * to the project's local framework directory so the platform can serve it.
 *
 * Called from the pipeline-callback handler after a CI run finishes.
 * Returns the `htmlReportRel` path on success, or null if unavailable.
 */

import { execFile } from "node:child_process";
import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import {
  parsePlaywrightReportJson,
  type TestRunResultsAnalysis,
} from "@/lib/test-execution/playwright-report-analysis";

const execFileAsync = promisify(execFile);

const DOWNLOAD_TIMEOUT_MS = 45_000;

// ──────────────────────────────────────────────────────────────────────────────
// URL helpers
// ──────────────────────────────────────────────────────────────────────────────

function extractGithubRunId(pipelineUrl: string): string | null {
  const match = /\/actions\/runs\/(\d+)/i.exec(pipelineUrl);
  return match?.[1] ?? null;
}

function extractOwnerRepo(remoteUrl: string): string | null {
  // Handles both:
  //   https://github.com/owner/repo.git
  //   https://oauth2:token@github.com/owner/repo.git
  const match = /github\.com[/:]([^/]+\/[^/.]+?)(?:\.git)?(?:\s|$)/i.exec(remoteUrl);
  return match?.[1] ?? null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Zip extraction
// ──────────────────────────────────────────────────────────────────────────────

async function extractZip(zipBuffer: Buffer, destDir: string): Promise<void> {
  const tempZip = path.join(tmpdir(), `playwright-artifact-${Date.now()}-${Math.random().toString(36).slice(2)}.zip`);
  try {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(tempZip, zipBuffer);
    await execFileAsync("unzip", ["-o", tempZip, "-d", destDir], {
      timeout: 30_000,
    });
  } finally {
    await rm(tempZip, { force: true }).catch(() => {});
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Main entry point
// ──────────────────────────────────────────────────────────────────────────────

export type CiReportResult = {
  htmlReportRel: string;
  analysis: TestRunResultsAnalysis | null;
};

export async function fetchAndSaveCiReport({
  projectId,
  runId,
  pipelineUrl,
  remoteUrl,
  ciToken,
}: {
  projectId: string;
  runId: string;
  pipelineUrl: string;
  remoteUrl: string;
  ciToken: string;
}): Promise<CiReportResult | null> {
  try {
    const githubRunId = extractGithubRunId(pipelineUrl);
    const ownerRepo = extractOwnerRepo(remoteUrl);
    if (!githubRunId || !ownerRepo) return null;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${ciToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "AutomationAI-Platform/1.0",
    };

    // ── 1. List artifacts for this Actions run ────────────────────────────────
    const artifactsRes = await fetch(
      `https://api.github.com/repos/${ownerRepo}/actions/runs/${githubRunId}/artifacts`,
      { headers, signal: AbortSignal.timeout(30_000) },
    );
    if (!artifactsRes.ok) {
      console.warn(
        `[fetch-ci-report] artifacts list failed: ${artifactsRes.status} for run ${githubRunId}`,
      );
      return null;
    }

    const artifactsData = (await artifactsRes.json()) as {
      artifacts: Array<{ id: number; name: string; expired: boolean }>;
    };

    // The workflow uploads the artifact with name `playwright-report-{run_id}`
    const artifactName = `playwright-report-${runId}`;
    let artifact = artifactsData.artifacts.find(
      (a) => a.name === artifactName && !a.expired,
    );

    // GitHub's artifact API can lag a few seconds after upload — retry up to 3×
    if (!artifact) {
      for (let attempt = 1; attempt <= 3 && !artifact; attempt++) {
        await new Promise((r) => setTimeout(r, attempt * 4_000));
        const retryRes = await fetch(
          `https://api.github.com/repos/${ownerRepo}/actions/runs/${githubRunId}/artifacts`,
          { headers, signal: AbortSignal.timeout(30_000) },
        );
        if (!retryRes.ok) break;
        const retryData = (await retryRes.json()) as {
          artifacts: Array<{ id: number; name: string; expired: boolean }>;
        };
        artifact = retryData.artifacts.find(
          (a) => a.name === artifactName && !a.expired,
        );
      }
    }

    if (!artifact) {
      console.warn(
        `[fetch-ci-report] artifact "${artifactName}" not found in run ${githubRunId}`,
      );
      return null;
    }

    // ── 2. Download the artifact zip ──────────────────────────────────────────
    const downloadRes = await fetch(
      `https://api.github.com/repos/${ownerRepo}/actions/artifacts/${artifact.id}/zip`,
      { headers, redirect: "follow", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) },
    );
    if (!downloadRes.ok || !downloadRes.body) {
      console.warn(
        `[fetch-ci-report] artifact download failed: ${downloadRes.status}`,
      );
      return null;
    }

    const zipBuffer = Buffer.from(await downloadRes.arrayBuffer());

    // ── 3. Extract to a temp directory ────────────────────────────────────────
    const tempDir = path.join(
      tmpdir(),
      `ci-report-${runId}-${Date.now()}`,
    );
    try {
      await mkdir(tempDir, { recursive: true });
      await extractZip(zipBuffer, tempDir);

      // ── 4. Copy playwright-report/ contents → logs/reports/{runId}/ ─────────
      const htmlSrcDir = path.join(tempDir, "playwright-report");
      const rel = `logs/reports/${runId}`;
      const destDir = resolveFrameworkFilePath(projectId, rel);
      if (!destDir) return null;

      await rm(destDir, { recursive: true, force: true });
      await mkdir(destDir, { recursive: true });
      await cp(htmlSrcDir, destDir, { recursive: true });

      // ── 5. Read JSON report for analysis (optional) ───────────────────────
      let analysis: TestRunResultsAnalysis | null = null;
      try {
        const jsonPath = path.join(tempDir, "logs", "playwright-report.json");
        const raw = await readFile(jsonPath, "utf8");
        analysis = parsePlaywrightReportJson(raw);
      } catch {
        // JSON report not in artifact — analysis stays null
      }

      // Also copy the JSON to the framework's standard location so local
      // tools can re-read it if needed.
      try {
        const frameworkRoot = getProjectFrameworkRoot(projectId);
        const jsonSrc = path.join(tempDir, "logs", "playwright-report.json");
        const jsonDest = path.join(frameworkRoot, "logs", "playwright-report.json");
        await mkdir(path.dirname(jsonDest), { recursive: true });
        await cp(jsonSrc, jsonDest);
      } catch {
        // Non-fatal
      }

      return { htmlReportRel: rel, analysis };
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  } catch (err) {
    const isTimeout = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    if (isTimeout) {
      console.warn("[fetch-ci-report] timed out waiting for GitHub artifact API");
    } else {
      console.error("[fetch-ci-report] unexpected error:", err instanceof Error ? err.message : err);
    }
    return null;
  }
}
