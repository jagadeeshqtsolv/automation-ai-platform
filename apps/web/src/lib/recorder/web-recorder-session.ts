import { spawn } from "node:child_process";
import { access, readFile, stat, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { installFrameworkDependencies } from "@/lib/local-framework/install-dependencies";
import { ensurePlaywrightBrowsersForProject } from "@/lib/recorder/run-dom-capture-script";

const SIGNAL_FILE = "environments/.recorder-capture.signal";
const STOP_FILE = "environments/.recorder-stop.signal";
const PID_FILE = "environments/.recorder.pid";
const SNAPSHOT_FILE = "environments/latest-dom-snapshot.json";

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPid(projectId: string): Promise<number | null> {
  const pidPath = resolveFrameworkFilePath(projectId, PID_FILE, "web");
  if (pidPath === null) {
    return null;
  }
  try {
    const raw = await readFile(pidPath, "utf8");
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function isWebRecorderSessionRunning(projectId: string): Promise<boolean> {
  const pid = await readPid(projectId);
  if (pid === null) {
    return false;
  }
  return isProcessAlive(pid);
}

export async function stopWebRecorderSession(projectId: string): Promise<void> {
  const stopPath = resolveFrameworkFilePath(projectId, STOP_FILE, "web");
  if (stopPath !== null) {
    await writeFile(stopPath, String(Date.now()), "utf8").catch(() => undefined);
  }
  const pid = await readPid(projectId);
  if (pid !== null && isProcessAlive(pid)) {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      // already exited
    }
  }
  await sleep(800);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function startWebRecorderSession(projectId: string): Promise<void> {
  await stopWebRecorderSession(projectId);

  const root = getProjectFrameworkRoot(projectId, "web");
  const install = await installFrameworkDependencies(projectId);
  if (!install.ok) {
    throw new Error(install.error ?? "Could not install framework dependencies");
  }

  await ensurePlaywrightBrowsersForProject(projectId);

  await new Promise<void>((resolve, reject) => {
    const child = spawn("node", ["scripts/capture-dom.mjs", "start"], {
      cwd: root,
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.once("error", reject);
    child.unref();
    resolve();
  });

  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const pid = await readPid(projectId);
    if (pid !== null && isProcessAlive(pid)) {
      return;
    }
    await sleep(500);
  }
  throw new Error("Recorder browser did not start. Check server logs and try again.");
}

export async function captureWebRecorderDom(projectId: string): Promise<string> {
  const running = await isWebRecorderSessionRunning(projectId);
  if (!running) {
    throw new Error("Recorder browser is not open. Click Open browser first.");
  }

  const snapshotPath = resolveFrameworkFilePath(projectId, SNAPSHOT_FILE, "web");
  const signalPath = resolveFrameworkFilePath(projectId, SIGNAL_FILE, "web");
  if (snapshotPath === null || signalPath === null) {
    throw new Error("Could not resolve recorder paths");
  }

  let beforeMtime = 0;
  if (await pathExists(snapshotPath)) {
    beforeMtime = (await stat(snapshotPath)).mtimeMs;
  }

  await writeFile(signalPath, String(Date.now()), "utf8");

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await pathExists(snapshotPath)) {
      const mtime = (await stat(snapshotPath)).mtimeMs;
      if (mtime > beforeMtime) {
        return await readFile(snapshotPath, "utf8");
      }
    }
    await sleep(300);
  }

  throw new Error("Capture timed out. Is the recorder browser still open?");
}
