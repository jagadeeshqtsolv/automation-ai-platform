import { spawn, type ChildProcess } from "node:child_process";
import {
  isTestRunCancelled,
  registerActiveTestRun,
  unregisterActiveTestRun,
} from "@/lib/test-execution/active-test-run-process";
import type { RunTestsResult } from "@/lib/test-execution/run-tests";

const RUN_TIMEOUT_MS = 600_000;
const MAX_OUTPUT_CHARS = 500_000;

function trimOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) {
    return text;
  }
  return text.slice(-MAX_OUTPUT_CHARS);
}

export type SpawnTrackedTestOptions = {
  runId: string;
  cwd: string;
  env: NodeJS.ProcessEnv;
  args: string[];
  command: string;
  provider: string;
  onLog: (chunk: string) => void;
};

export function spawnTrackedTestProcess(options: SpawnTrackedTestOptions): Promise<RunTestsResult> {
  const { runId, cwd, env, args, command, provider, onLog } = options;

  return new Promise((resolve) => {
    const child = spawn("npx", args, {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    registerActiveTestRun(runId, child);

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      onLog("\n[Test run timed out after 10 minutes]\n");
      child.kill("SIGTERM");
    }, RUN_TIMEOUT_MS);

    const finish = (result: RunTestsResult): void => {
      clearTimeout(timer);
      unregisterActiveTestRun(runId);
      resolve(result);
    };

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      onLog(text);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      onLog(text);
    });

    child.on("error", (err) => {
      const message = `${err.message}\n`;
      onLog(message);
      finish({
        ok: false,
        exitCode: null,
        output: trimOutput(message),
        provider,
        command,
        cancelled: false,
      });
    });

    child.on("close", (code) => {
      const cancelled = isTestRunCancelled(runId);
      if (cancelled) {
        onLog("\n[Test run stopped by user]\n");
        finish({
          ok: false,
          exitCode: code,
          output: trimOutput(
            [stdout, stderr, "\n[Test run stopped by user]\n"].filter((s) => s.length > 0).join("\n"),
          ),
          provider,
          command,
          cancelled: true,
        });
        return;
      }

      const combined = [stdout, stderr].filter((s) => s.length > 0).join("\n");
      const trimmed = trimOutput(
        combined.length > 0 ? combined : `Process exited with code ${code ?? "unknown"}\n`,
      );
      finish({
        ok: code === 0,
        exitCode: code,
        output: trimmed,
        provider,
        command,
        cancelled: false,
      });
    });
  });
}
