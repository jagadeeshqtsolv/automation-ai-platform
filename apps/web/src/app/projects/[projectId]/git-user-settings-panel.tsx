"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";
import { Portal } from "@/components/portal";

type UserGitConfig = {
  branch: string | null;
  authorName: string | null;
  authorEmail: string | null;
  hasToken: boolean;
  tokenPreview: string | null;
};

type ProjectGitConfig = {
  remoteUrl: string | null;
  baseBranch: string;
};

export function GitUserSettingsPanel({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [userConfig, setUserConfig] = useState<UserGitConfig | null>(null);
  const [projectConfig, setProjectConfig] = useState<ProjectGitConfig | null>(null);

  const [branch, setBranch] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [initialising, setInitialising] = useState(false);
  const [initResult, setInitResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchResult, setFetchResult] = useState<{ newCommits: boolean; output: string } | null>(null);

  const load = useCallback(async () => {
    if (!open) return;
    const res = await fetch(`/api/projects/${projectId}/git-config`);
    if (!res.ok) return;
    const body = (await res.json()) as {
      projectConfig: ProjectGitConfig;
      userConfig: UserGitConfig;
    };
    setProjectConfig(body.projectConfig);
    setUserConfig(body.userConfig);
    setBranch(body.userConfig.branch ?? "");
    setAuthorName(body.userConfig.authorName ?? "");
    setAuthorEmail(body.userConfig.authorEmail ?? "");
  }, [open, projectId]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setInitResult(null);
    try {
      const payload: Record<string, string | null> = {
        gitBranch: branch.trim() || null,
        gitAuthorName: authorName.trim() || null,
        gitAuthorEmail: authorEmail.trim() || null,
      };
      if (token.trim().length > 0) payload.gitToken = token.trim();

      const res = await fetch(`/api/projects/${projectId}/git-config/user`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { toast.error(await readApiError(res, "Could not save Git Settings")); return; }

      const savedToken = token.trim();
      setToken("");
      setTestResult(null);
      await load();
      toast.success("Git Settings saved");

      // Auto-init: create the user's branch from the base branch if everything is configured
      const hasToken = savedToken.length > 0 || userConfig?.hasToken;
      if (
        branch.trim() &&
        authorName.trim() &&
        authorEmail.trim() &&
        hasToken &&
        projectConfig?.remoteUrl
      ) {
        setInitialising(true);
        try {
          const initRes = await fetch(`/api/projects/${projectId}/git-config/init`, { method: "POST" });
          const initBody = (await initRes.json()) as { ok?: boolean; error?: string };
          if (initRes.ok) {
            setInitResult({
              ok: true,
              message: `Branch "${branch.trim()}" is ready — checked out from ${projectConfig.baseBranch}.`,
            });
          } else {
            setInitResult({ ok: false, message: initBody.error ?? "Could not initialize branch" });
          }
        } finally {
          setInitialising(false);
        }
      }
    } finally {
      setSaving(false);
    }
  }

  async function onTest() {
    if (!projectConfig?.remoteUrl) { toast.error("Remote URL not configured — ask an owner to set it in Setup → Git"); return; }
    if (!userConfig?.hasToken && token.trim().length === 0) {
      toast.error("Enter your access token before testing");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const payload: Record<string, string> = {};
      if (token.trim().length > 0) payload.token = token.trim();
      const res = await fetch(`/api/projects/${projectId}/git-config/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok: boolean; message: string };
      setTestResult(body);
    } finally {
      setTesting(false);
    }
  }

  async function onFetch() {
    setFetching(true);
    setFetchResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git-config/fetch`, { method: "POST" });
      if (!res.ok) { toast.error(await readApiError(res, "Fetch failed")); return; }
      const body = (await res.json()) as { newCommits: boolean; output: string };
      setFetchResult(body);
      toast.success(body.newCommits ? "Fetched — remote has new commits" : "Already up to date");
    } finally {
      setFetching(false);
    }
  }

  if (!open) return null;

  const repoReady = projectConfig?.remoteUrl !== null && projectConfig?.remoteUrl !== undefined;
  const branchConflictsWithBase =
    branch.trim().length > 0 &&
    projectConfig !== null &&
    (branch.trim() === projectConfig.baseBranch || branch.trim() === "main");

  return (
    <Portal>
      <div
        className="fixed inset-0 z-40 bg-white"
        onClick={onClose}
        aria-hidden
      />
      <aside
        className="fixed inset-y-0 left-0 z-50 flex w-full max-w-sm flex-col bg-white shadow-xl ring-1 ring-slate-200 "
        role="dialog"
        aria-label="Git Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Your Git Settings</h2>
            <p className="text-[11px] text-slate-500">Branch, access token and author identity</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
          {userConfig === null ? (
            <p className="text-sm text-slate-500">Loading…</p>
          ) : (
            <>
              {/* Status summary */}
              {userConfig.tokenPreview && userConfig.branch ? (
                <dl className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs">
                  <div>
                    <dt className="text-slate-500">Branch</dt>
                    <dd className="mt-0.5 font-mono text-slate-700">{userConfig.branch}</dd>
                  </div>
                  {userConfig.authorName ? (
                    <div>
                      <dt className="text-slate-500">Author</dt>
                      <dd className="mt-0.5 text-slate-700">{userConfig.authorName}</dd>
                    </div>
                  ) : null}
                  <div className="col-span-2">
                    <dt className="text-slate-500">Token</dt>
                    <dd className="mt-0.5 font-mono text-slate-600">{userConfig.tokenPreview}</dd>
                  </div>
                </dl>
              ) : (
                <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-600">
                  {!userConfig.branch
                    ? "Set a unique branch name below so your changes don't conflict with others."
                    : "No access token saved yet — fill in the form below."}
                </div>
              )}

              <form onSubmit={onSave} className="space-y-3">
                {/* Branch */}
                <label className="block text-xs text-slate-500">
                  Your working branch <span className="text-rose-600">(required)</span>
                  <input
                    value={branch}
                    onChange={(e) => { setBranch(e.target.value); setInitResult(null); }}
                    placeholder="feature/your-name"
                    maxLength={100}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400"
                  />
                  {projectConfig ? (
                    <span className="mt-1 block text-[10px] text-slate-500">
                      Push here, then raise a PR to merge into{" "}
                      <code className="text-slate-500">{projectConfig.baseBranch}</code>.
                    </span>
                  ) : null}
                  {branchConflictsWithBase ? (
                    <span className="mt-1 block text-[10px] text-amber-700">
                      This is the protected base branch — choose a different name like{" "}
                      <code>feature/your-name</code>.
                    </span>
                  ) : null}
                </label>

                <label className="block text-xs text-slate-500">
                  Commit author name
                  <input
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Jane Smith"
                    maxLength={120}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="block text-xs text-slate-500">
                  Commit author email
                  <input
                    type="email"
                    value={authorEmail}
                    onChange={(e) => setAuthorEmail(e.target.value)}
                    placeholder="jane@yourorg.com"
                    maxLength={200}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </label>

                <label className="block text-xs text-slate-500">
                  Personal access token{" "}
                  <span className="text-slate-500">
                    {userConfig.hasToken ? "(leave blank to keep current)" : "(required)"}
                  </span>
                  <input
                    type="password"
                    value={token}
                    onChange={(e) => { setToken(e.target.value); setTestResult(null); }}
                    autoComplete="off"
                    placeholder={userConfig.hasToken ? "••••••••" : "ghp_…"}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 font-mono text-sm text-slate-900"
                  />
                </label>

                {testResult !== null ? (
                  <div
                    role="alert"
                    className={`rounded-lg border px-3 py-2 text-xs ${
                      testResult.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-600"
                    }`}
                  >
                    {testResult.ok ? "✓ " : "✗ "}{testResult.message}
                  </div>
                ) : null}

                {/* Branch init result */}
                {initialising ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
                    Setting up your branch…
                  </div>
                ) : initResult !== null ? (
                  <div
                    role="alert"
                    className={`rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap break-words ${
                      initResult.ok
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-rose-200 bg-rose-50 text-rose-600"
                    }`}
                  >
                    {initResult.ok ? "✓ " : "✗ "}{initResult.message}
                  </div>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={testing || saving || initialising || !repoReady}
                    onClick={() => void onTest()}
                    title={!repoReady ? "Remote URL not configured — set it in Setup → Git" : undefined}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {testing ? "Testing…" : "Test Connection"}
                  </button>
                  <button
                    type="submit"
                    disabled={saving || testing || initialising || branchConflictsWithBase}
                    className="ui-btn-primary ui-btn-xs disabled:opacity-50"
                  >
                    {saving ? "Saving…" : initialising ? "Setting up branch…" : "Save Settings"}
                  </button>
                </div>
              </form>

              {/* Fetch remote */}
              <div className="border-t border-slate-200 pt-3 space-y-2">
                <p className="text-[11px] text-slate-500">
                  Fetch the latest commits from the remote repository.
                </p>
                <button
                  type="button"
                  disabled={fetching}
                  onClick={() => void onFetch()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 transition"
                >
                  <FetchIcon />
                  {fetching ? "Fetching…" : "Fetch remote"}
                </button>

                {fetchResult !== null && (
                  <div className={`rounded-lg border px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all ${
                    fetchResult.newCommits
                      ? "border-sky-200 bg-sky-50 text-sky-700"
                      : "border-slate-200 bg-slate-50 text-slate-500"
                  }`}>
                    {fetchResult.output}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </aside>
    </Portal>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function FetchIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );
}
