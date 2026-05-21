import { spawn } from "node:child_process";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";
import { installFrameworkDependencies } from "@/lib/local-framework/install-dependencies";
import { getProjectPlatformType } from "@/lib/project-platform";

export async function ensurePlaywrightBrowsersForProject(projectId: string): Promise<void> {
  const root = getProjectFrameworkRoot(projectId, "web");
  await new Promise<void>((resolve, reject) => {
    const child = spawn("npx", ["playwright", "install", "chromium"], {
      cwd: root,
      stdio: "pipe",
      env: process.env,
    });
    let stderr = "";
    const timer = setTimeout(() => child.kill("SIGTERM"), 600_000);
    child.stderr?.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
      if (stderr.length > 4_000) stderr = stderr.slice(-4_000);
    });
    child.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `playwright install exited with code ${String(code)}`));
    });
  });
}
