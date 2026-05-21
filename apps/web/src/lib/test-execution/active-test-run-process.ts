import type { ChildProcess } from "node:child_process";

type ActiveEntry = {
  child: ChildProcess;
  cancelled: boolean;
};

const activeByRunId = new Map<string, ActiveEntry>();

export function registerActiveTestRun(runId: string, child: ChildProcess): void {
  activeByRunId.set(runId, { child, cancelled: false });
}

export function unregisterActiveTestRun(runId: string): void {
  activeByRunId.delete(runId);
}

export function isTestRunCancelled(runId: string): boolean {
  return activeByRunId.get(runId)?.cancelled === true;
}

/** Request stop for an in-progress run. Returns false if no active process is registered. */
export function cancelActiveTestRun(runId: string): boolean {
  const entry = activeByRunId.get(runId);
  if (entry === undefined) {
    return false;
  }
  entry.cancelled = true;
  try {
    entry.child.kill("SIGTERM");
  } catch {
    /* process may already have exited */
  }
  setTimeout(() => {
    const current = activeByRunId.get(runId);
    if (current !== undefined && current.child === entry.child) {
      try {
        entry.child.kill("SIGKILL");
      } catch {
        /* ignore */
      }
    }
  }, 4_000);
  return true;
}
