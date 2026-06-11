"use client";

import { useCallback, useEffect, useState } from "react";
import { GitPushPanel } from "./git-push-panel";
import { GitTerminalPanel } from "./git-terminal-panel";
import { GitUserSettingsPanel } from "./git-user-settings-panel";

type GitStatus = {
  branch: string | null;
  baseBranch: string;
  pendingFiles: number;
  initialized: boolean;
  hasRemote: boolean;
  hasToken: boolean;
  remoteConfigured: boolean;
};

export function GitStatusWidget({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [pushOpen, setPushOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/git-config`);
      if (!res.ok) return;
      const body = (await res.json()) as {
        projectConfig: { remoteUrl: string | null; baseBranch: string };
        userConfig: { branch: string | null; hasToken: boolean };
        repoStatus: { initialized: boolean; hasRemote: boolean; pendingFiles: number };
      };
      setStatus({
        branch: body.userConfig.branch,
        baseBranch: body.projectConfig.baseBranch,
        pendingFiles: body.repoStatus.pendingFiles,
        initialized: body.repoStatus.initialized,
        hasRemote: body.repoStatus.hasRemote,
        hasToken: body.userConfig.hasToken,
        remoteConfigured: body.projectConfig.remoteUrl !== null,
      });
    } catch {
      // widget is informational only
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // Poll until the remote is configured (admin hasn't saved it yet), then keep
  // a slow background refresh for pending-file count updates.
  useEffect(() => {
    const interval = setInterval(
      () => void load(),
      status?.remoteConfigured ? 30_000 : 5_000,
    );
    return () => clearInterval(interval);
  }, [load, status?.remoteConfigured]);

  // Immediately refresh when git settings are saved from the Setup tab.
  useEffect(() => {
    const handler = () => void load();
    window.addEventListener("git-config-saved", handler);
    return () => window.removeEventListener("git-config-saved", handler);
  }, [load]);

  function handlePushClose() {
    setPushOpen(false);
    void load();
  }

  function handleSettingsClose() {
    setSettingsOpen(false);
    void load();
  }

  async function handleSync() {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git-config/sync`, { method: "POST" });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok) {
        setSyncResult({ ok: true, message: `Synced with ${status?.baseBranch ?? "main"}` });
        void load();
      } else {
        setSyncResult({ ok: false, message: body.error ?? "Sync failed" });
      }
    } catch {
      setSyncResult({ ok: false, message: "Sync failed" });
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncResult(null), 4000);
    }
  }

  // Hide the entire git section until admin has configured a remote URL
  if (status !== null && !status.remoteConfigured) return null;

  const onBaseBranch = status !== null && !!status.branch && status.branch === status.baseBranch;
  // Ready to push once: repo URL is configured, user has a personal (non-base) branch and token.
  const ready = status !== null && status.remoteConfigured && !!status.branch && status.hasToken && !onBaseBranch;
  const hasPending = (status?.pendingFiles ?? 0) > 0;

  return (
    <>
      {/* GIT section in the nav */}
      <div className="border-t border-slate-200 px-1 pt-3 pb-1">
        {/* Section label */}
        <p className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          Git
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">
          {/* Warning: on base branch */}
          {onBaseBranch && (
            <div className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[10px] text-amber-600 leading-snug">
              You&apos;re on <code className="font-mono">{status?.baseBranch}</code> — open{" "}
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="underline hover:text-amber-700"
              >
                Git Settings
              </button>{" "}
              and set a personal branch to push changes.
            </div>
          )}

          {/* Branch + pending count */}
          <div className="flex items-center gap-2">
            <BranchIcon />
            <span
              className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-600"
              title={status?.branch ?? undefined}
            >
              {status?.branch ?? "—"}
            </span>
            {status !== null && hasPending ? (
              <span className="shrink-0 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-amber-600">
                {status.pendingFiles}
              </span>
            ) : status !== null ? (
              <span className="shrink-0 rounded-md bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                clean
              </span>
            ) : null}
          </div>

          {/* Sync with base branch */}
          <button
            type="button"
            onClick={() => void handleSync()}
            disabled={syncing || !status?.remoteConfigured}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition disabled:opacity-40"
          >
            {syncing ? (
              <>
                <SyncSpinner />
                Syncing…
              </>
            ) : (
              <>
                <SyncIcon />
                Sync with {status?.baseBranch ?? "main"}
              </>
            )}
          </button>

          {/* Sync result */}
          {syncResult !== null && (
            <p className={`text-[10px] leading-snug px-0.5 ${syncResult.ok ? "text-emerald-700" : "text-red-400"}`}>
              {syncResult.ok ? "✓" : "✗"} {syncResult.message}
            </p>
          )}

          {/* Action buttons */}
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setSettingsOpen(true)}
              className="flex items-center justify-center gap-1 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition"
            >
              <GearIcon />
              Settings
            </button>

            <button
              type="button"
              onClick={() => setPushOpen(true)}
              disabled={!ready}
              title={
                !ready
                  ? status === null
                    ? "Loading…"
                    : !status.remoteConfigured
                    ? "Configure remote URL in Setup → Git"
                    : !status.branch
                    ? "Set your working branch in Git Settings"
                    : onBaseBranch
                    ? `Set a personal branch — you can't push directly to ${status.baseBranch}`
                    : "Add your access token in Git Settings"
                  : undefined
              }
              className={`flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition disabled:opacity-40 ${
                ready && hasPending
                  ? "bg-accent text-slate-900 hover:bg-accent/90"
                  : "border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
              }`}
            >
              <PushIcon />
              {hasPending && status ? `Push (${status.pendingFiles})` : "Push"}
            </button>
          </div>

          {/* Terminal shortcut */}
          <button
            type="button"
            onClick={() => setTerminalOpen(true)}
            className="flex w-full items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-mono text-slate-500 hover:bg-slate-50 hover:text-slate-500 transition"
          >
            <TerminalIcon />
            <span className="text-green-700/60">$</span>
            <span>git terminal</span>
          </button>
        </div>
      </div>

      <GitUserSettingsPanel
        projectId={projectId}
        open={settingsOpen}
        onClose={handleSettingsClose}
      />

      <GitPushPanel
        projectId={projectId}
        open={pushOpen}
        onClose={handlePushClose}
        onPushed={() => void load()}
      />

      <GitTerminalPanel
        projectId={projectId}
        open={terminalOpen}
        onClose={() => setTerminalOpen(false)}
      />
    </>
  );
}

function BranchIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v10.5a3 3 0 003 3h4.5M9 7.5L6 5.25M9 7.5L12 5.25" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  );
}

function PushIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  );
}

function SyncSpinner() {
  return (
    <svg className="h-3.5 w-3.5 shrink-0 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
    </svg>
  );
}
