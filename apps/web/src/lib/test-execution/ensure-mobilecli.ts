import { spawn } from "node:child_process";
import path from "node:path";
import { access } from "node:fs/promises";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";

const DEFAULT_MOBILECLI_WS_URL = "ws://localhost:12000/ws";

/** Runs in a child process so Next.js does not strip `createRequire`. */
const ENSURE_MOBILECLI_SCRIPT = `
import { createRequire } from "node:module";
import { join } from "node:path";
const root = process.env.MW_FRAMEWORK_ROOT;
if (typeof root !== "string" || root.length === 0) {
  console.error("MW_FRAMEWORK_ROOT is not set");
  process.exit(1);
}
const req = createRequire(join(root, "package.json"));
const serverPath = join(root, "node_modules/mobilewright/dist/server.js");
const { ensureMobilecliReachable } = req(serverPath);
const { DEFAULT_URL } = req("@mobilewright/driver-mobilecli");
await ensureMobilecliReachable(DEFAULT_URL, { autoStart: true });
`.trim();

export type EnsureMobilecliResult =
  | { ok: true; message: string }
  | { ok: false; message: string };

function runEnsureMobilecliSubprocess(frameworkRoot: string): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["--input-type=module", "-e", ENSURE_MOBILECLI_SCRIPT], {
      cwd: frameworkRoot,
      env: { ...process.env, MW_FRAMEWORK_ROOT: frameworkRoot },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
      if (stderr.length > 4_000) {
        stderr = stderr.slice(-4_000);
      }
    });

    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stderr: stderr.trim() });
    });
  });
}

/**
 * Ensures the mobilecli WebSocket server is reachable before `mobilewright test`.
 * Uses the framework's bundled mobilecli binary (npm package `mobilecli`).
 */
export async function ensureMobilecliForTestRun(projectId: string): Promise<EnsureMobilecliResult> {
  const root = getProjectFrameworkRoot(projectId);
  const pkgPath = path.join(root, "package.json");

  try {
    await access(pkgPath);
  } catch {
    return { ok: false, message: "Framework package.json not found — run code generation first." };
  }

  try {
    const { exitCode, stderr } = await runEnsureMobilecliSubprocess(root);
    if (exitCode !== 0) {
      const detail = stderr.length > 0 ? stderr : `exit code ${exitCode}`;
      return {
        ok: false,
        message:
          `mobilecli is required for local test runs but could not be started.\n${detail}\n` +
          `Run \`npx mobilewright doctor\` in the framework folder and ensure an Android emulator or iOS simulator is online.`,
      };
    }
    return { ok: true, message: `mobilecli server ready at ${DEFAULT_MOBILECLI_WS_URL}` };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      message:
        `mobilecli is required for local test runs but could not be started.\n${detail}\n` +
        `Run \`npx mobilewright doctor\` in the framework folder and ensure an Android emulator or iOS simulator is online.`,
    };
  }
}
