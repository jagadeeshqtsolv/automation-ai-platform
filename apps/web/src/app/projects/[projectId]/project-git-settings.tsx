"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { detectCiProvider, type CiProvider } from "@jagadeeshqtsolv/core";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";

type ProjectGitConfig = {
  remoteUrl: string | null;
  baseBranch: string;
};

type ProjectCiConfig = {
  workflowFile: string;
  hasCiToken: boolean;
  ciTokenPreview: string | null;
};

type UserGitConfig = {
  branch: string | null;
  authorName: string | null;
  authorEmail: string | null;
  hasToken: boolean;
  tokenPreview: string | null;
};

export function ProjectGitSettings({
  projectId,
  disabled,
  isOwner = false,
}: {
  projectId: string;
  disabled: boolean;
  isOwner?: boolean;
}) {
  const toast = useToast();

  const [projectConfig, setProjectConfig] = useState<ProjectGitConfig | null>(null);
  const [ciConfig, setCiConfig] = useState<ProjectCiConfig | null>(null);
  const [userConfig, setUserConfig] = useState<UserGitConfig | null>(null);

  // Repo-level fields (locked once saved)
  const [remoteUrl, setRemoteUrl] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [editingRepo, setEditingRepo] = useState(false);
  const [savingRepo, setSavingRepo] = useState(false);
  const [repoSaveError, setRepoSaveError] = useState<string | null>(null);

  // Identity fields (always editable)
  const [branch, setBranch] = useState("");
  const [authorName, setAuthorName] = useState("");
  const [authorEmail, setAuthorEmail] = useState("");
  const [token, setToken] = useState("");
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [initialising, setInitialising] = useState(false);
  const [identityResult, setIdentityResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Test + push-to-base
  const [testing, setTesting] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [pushResult, setPushResult] = useState<{ committed: boolean; branch: string } | null>(null);
  const [pushError, setPushError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/git-config`);
    if (!res.ok) return;
    const body = (await res.json()) as {
      projectConfig: ProjectGitConfig;
      ciConfig: ProjectCiConfig | null;
      userConfig: UserGitConfig;
    };
    setProjectConfig(body.projectConfig);
    setCiConfig(body.ciConfig ?? null);
    setUserConfig(body.userConfig);
    setRemoteUrl(body.projectConfig.remoteUrl ?? "");
    setBaseBranch(body.projectConfig.baseBranch);
    setBranch(body.userConfig.branch ?? "");
    setAuthorName(body.userConfig.authorName ?? "");
    setAuthorEmail(body.userConfig.authorEmail ?? "");
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  // ── Save repository settings (remote URL + base branch) ─────────────────
  async function onSaveRepo(e: FormEvent) {
    e.preventDefault();
    setSavingRepo(true);
    setRepoSaveError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git-config`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gitRemoteUrl: remoteUrl.trim() || null,
          gitBaseBranch: baseBranch.trim() || "main",
        }),
      });
      if (!res.ok) {
        setRepoSaveError(await readApiError(res, "Could not save repository settings"));
        return;
      }
      await load();
      setEditingRepo(false);
      toast.success("Repository settings saved");
    } finally {
      setSavingRepo(false);
    }
  }

  // ── Save identity + trigger auto-init ────────────────────────────────────
  async function onSaveIdentity(e: FormEvent) {
    e.preventDefault();
    setSavingIdentity(true);
    setIdentityResult(null);
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
      if (!res.ok) {
        setIdentityResult({ ok: false, message: await readApiError(res, "Could not save Git settings") });
        return;
      }

      const savedToken = token.trim();
      setToken("");
      await load();
      toast.success("Settings saved");

      // Auto-init: create/switch to the working branch from the base branch.
      const effectiveBase = baseBranch.trim() || "main";
      const hasToken = savedToken.length > 0 || userConfig?.hasToken;
      if (branch.trim() && branch.trim() !== effectiveBase && authorName.trim() && authorEmail.trim() && hasToken && projectConfig?.remoteUrl) {
        setInitialising(true);
        setSavingIdentity(false);
        try {
          const initRes = await fetch(`/api/projects/${projectId}/git-config/init`, { method: "POST" });
          const initBody = (await initRes.json()) as { ok?: boolean; error?: string };
          setIdentityResult(
            initRes.ok
              ? { ok: true, message: `Branch "${branch.trim()}" is ready — checked out from ${effectiveBase}.` }
              : { ok: false, message: initBody.error ?? "Could not initialize branch" },
          );
        } finally {
          setInitialising(false);
        }
      } else if (!branch.trim()) {
        setIdentityResult({ ok: false, message: "Set your working branch above — it must not be the same as the base branch." });
      } else {
        setIdentityResult({ ok: true, message: "Settings saved." });
      }
    } finally {
      setSavingIdentity(false);
    }
  }

  async function onTest() {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git-config/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const body = (await res.json()) as { ok: boolean; message: string };
      setTestResult(body);
    } catch (e) {
      setTestResult({ ok: false, message: e instanceof Error ? e.message : "Test failed" });
    } finally {
      setTesting(false);
    }
  }

  async function onPushToMain() {
    setPushing(true);
    setPushResult(null);
    setPushError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git-config/push-to-base`, { method: "POST" });
      if (!res.ok) {
        setPushError(await readApiError(res, "Push to main failed"));
        return;
      }
      const body = (await res.json()) as { committed: boolean; branch: string };
      setPushResult(body);
      await load();
      toast.success(
        body.committed
          ? `Pushed to "${body.branch}" — main branch is ready`
          : `"${body.branch}" is already up to date`,
      );
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Push failed");
    } finally {
      setPushing(false);
    }
  }

  if (!projectConfig || !userConfig) {
    return <p className="text-sm text-zinc-400">Loading Git settings…</p>;
  }

  const repoConfigured = !!projectConfig.remoteUrl;
  const effectiveBase = baseBranch.trim() || projectConfig.baseBranch || "main";
  const branchConflicts = branch.trim() !== "" && branch.trim() === effectiveBase;

  return (
    <div className="space-y-4">

      {/* ── Repository card ─────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-ink-950/30 p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Repository</h3>
            <p className="mt-0.5 text-xs text-zinc-400">Shared remote repository for this project.</p>
          </div>
          {isOwner && repoConfigured && !editingRepo && (
            <button
              type="button"
              onClick={() => { setEditingRepo(true); setRepoSaveError(null); }}
              className="shrink-0 rounded-lg border border-white/10 px-2.5 py-1 text-[11px] font-semibold text-zinc-400 hover:bg-white/[0.06] hover:text-white transition"
              data-testid="git-repo-edit-btn"
            >
              Edit
            </button>
          )}
        </div>

        {/* Non-owners: always read-only */}
        {!isOwner ? (
          <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            {repoConfigured ? (
              <>
                <p className="break-all font-mono text-xs text-zinc-300">{projectConfig.remoteUrl}</p>
                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <span>Base branch:</span>
                  <code className="text-zinc-300">{projectConfig.baseBranch}</code>
                </div>
              </>
            ) : (
              <p className="text-xs text-zinc-500 italic">Not configured yet — ask an owner to set it up.</p>
            )}
            <p className="text-[10px] text-zinc-600">Repository settings are managed by project owners.</p>
          </div>
        ) : repoConfigured && !editingRepo ? (
          /* Owner locked display */
          <div className="space-y-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
              <LockIcon />
              <span>Locked — click Edit to change</span>
            </div>
            <p className="break-all font-mono text-xs text-zinc-300">{projectConfig.remoteUrl}</p>
            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <span>Base branch:</span>
              <code className="text-zinc-300">{projectConfig.baseBranch}</code>
            </div>
          </div>
        ) : (
          /* Owner editable form */
          <form onSubmit={onSaveRepo} className="space-y-3" data-testid="git-repo-form">
            {repoConfigured && editingRepo && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                Changing the repository URL or base branch while team members are active will break their local setup.
              </div>
            )}
            <label className="block text-xs text-zinc-400">
              Remote URL <span className="text-rose-300">(required)</span>
              <input
                type="url"
                value={remoteUrl}
                onChange={(e) => setRemoteUrl(e.target.value)}
                placeholder="https://github.com/your-org/your-repo.git"
                required
                disabled={savingRepo}
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                data-testid="git-remote-url-input"
              />
            </label>
            <label className="block text-xs text-zinc-400">
              Base branch <span className="text-zinc-500">(PR target — e.g. main)</span>
              <input
                value={baseBranch}
                onChange={(e) => setBaseBranch(e.target.value)}
                placeholder="main"
                maxLength={100}
                disabled={savingRepo}
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                data-testid="git-base-branch-input"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={savingRepo}
                className="ui-btn-primary ui-btn-xs disabled:opacity-50"
                data-testid="git-repo-save-btn"
              >
                {savingRepo ? <><Spinner />Saving…</> : "Save repository settings"}
              </button>
              {editingRepo && (
                <button
                  type="button"
                  onClick={() => { setEditingRepo(false); setRemoteUrl(projectConfig.remoteUrl ?? ""); setBaseBranch(projectConfig.baseBranch); setRepoSaveError(null); }}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                  data-testid="git-repo-cancel-btn"
                >
                  Cancel
                </button>
              )}
            </div>
            {repoSaveError && (
              <p className="text-xs text-rose-400 whitespace-pre-wrap break-words">✗ {repoSaveError}</p>
            )}
          </form>
        )}
      </div>

      {/* ── Identity card ───────────────────────────────────────────── */}
      <div className="rounded-xl border border-white/10 bg-ink-950/30 p-4 space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-white">Your Git Identity</h3>
          <p className="mt-0.5 text-xs text-zinc-400">
            Your personal branch and commit details. Save to create your branch from <code className="text-zinc-300">{projectConfig.baseBranch}</code>.
          </p>
        </div>

        <form onSubmit={onSaveIdentity} className="space-y-3" data-testid="git-identity-form">
          <label className="block text-xs text-zinc-400">
            Your working branch <span className="text-rose-300">(required)</span>
            <input
              value={branch}
              onChange={(e) => { setBranch(e.target.value); setIdentityResult(null); }}
              placeholder="feature/your-name"
              maxLength={100}
              required
              disabled={disabled || savingIdentity || initialising}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
              data-testid="git-branch-input"
            />
            <span className="mt-1 block text-[10px] text-zinc-500">
              Push here, then raise a PR → <code className="text-zinc-400">{projectConfig.baseBranch}</code>.
            </span>
            {branchConflicts && (
              <span className="mt-1 block text-[10px] text-amber-400">
                This is the protected base branch — choose a different name like <code>feature/your-name</code>.
              </span>
            )}
          </label>

          <label className="block text-xs text-zinc-400">
            Commit author name
            <input
              value={authorName}
              onChange={(e) => setAuthorName(e.target.value)}
              placeholder="Jane Smith"
              maxLength={120}
              disabled={disabled || savingIdentity || initialising}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
              data-testid="git-author-name-input"
            />
          </label>

          <label className="block text-xs text-zinc-400">
            Commit author email
            <input
              type="email"
              value={authorEmail}
              onChange={(e) => setAuthorEmail(e.target.value)}
              placeholder="jane@yourorg.com"
              maxLength={200}
              disabled={disabled || savingIdentity || initialising}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
              data-testid="git-author-email-input"
            />
          </label>

          <label className="block text-xs text-zinc-400">
            Personal access token{" "}
            <span className="text-zinc-500">
              {userConfig.hasToken ? "(leave blank to keep current)" : "(required)"}
            </span>
            {userConfig.tokenPreview && (
              <span className="ml-2 font-mono text-[10px] text-zinc-500">{userConfig.tokenPreview}</span>
            )}
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              placeholder={userConfig.hasToken ? "••••••••" : "ghp_…"}
              disabled={disabled || savingIdentity || initialising}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 font-mono text-sm text-white disabled:opacity-50"
              data-testid="git-token-input"
            />
          </label>

          <button
            type="submit"
            disabled={disabled || savingIdentity || initialising || branchConflicts}
            className="ui-btn-primary ui-btn-xs disabled:opacity-50"
            data-testid="git-identity-save-btn"
          >
            {initialising ? <><Spinner />Setting up branch…</> : savingIdentity ? <><Spinner />Saving…</> : "Save settings"}
          </button>
        </form>

        {identityResult !== null && (
          <div
            role="alert"
            className={`rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap break-words ${
              identityResult.ok
                ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                : "border-rose-500/30 bg-rose-500/10 text-rose-300"
            }`}
          >
            {identityResult.ok ? "✓ " : "✗ "}{identityResult.message}
          </div>
        )}
      </div>

      {/* ── Test Connection ─────────────────────────────────────────── */}
      {projectConfig.remoteUrl && (
        <div className="rounded-xl border border-white/10 bg-ink-950/30 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Test Connection</h3>
            <p className="mt-0.5 text-xs text-zinc-400">Verify the repository is reachable with your access token.</p>
          </div>
          <button
            type="button"
            onClick={() => void onTest()}
            disabled={testing}
            className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-zinc-300 hover:bg-white/[0.07] disabled:opacity-50 transition"
            data-testid="git-test-connection-btn"
          >
            {testing ? <><Spinner />Testing…</> : "Test connection"}
          </button>
          {testResult !== null && (
            <div
              role="alert"
              className={`rounded-lg border px-3 py-2 text-xs whitespace-pre-wrap break-words ${
                testResult.ok
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
                  : "border-rose-500/30 bg-rose-500/10 text-rose-300"
              }`}
            >
              {testResult.ok ? "✓ " : "✗ "}{testResult.message}
            </div>
          )}
        </div>
      )}

      {/* ── Initialize Main Branch ──────────────────────────────────── */}
      {isOwner && projectConfig.remoteUrl && (
        <div className="rounded-xl border border-white/10 bg-ink-950/30 p-4 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-white">Initialize Main Branch</h3>
            <p className="mt-0.5 text-xs text-zinc-400">
              Push the base project structure to{" "}
              <code className="text-zinc-200">{projectConfig.baseBranch}</code>.
              Run once to seed the repository; after this your branch switches back automatically.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void onPushToMain()}
            disabled={pushing}
            className="inline-flex items-center gap-2 rounded-lg border border-accent/30 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent hover:bg-accent/15 disabled:opacity-50 transition"
            data-testid="git-push-to-main-btn"
          >
            {pushing ? <><Spinner />Pushing to {projectConfig.baseBranch}…</> : <><RocketIcon />Push to {projectConfig.baseBranch}</>}
          </button>

          {pushResult !== null && (
            <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">
              {pushResult.committed ? (
                <>✓ Pushed to <code className="text-emerald-200">{pushResult.branch}</code> — base structure is on main.</>
              ) : (
                <>✓ <code className="text-emerald-200">{pushResult.branch}</code> is already up to date.</>
              )}
            </div>
          )}
          {pushError && (
            <div className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-3 py-2 text-xs text-rose-300 whitespace-pre-wrap break-words">
              ✗ {pushError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />;
}

function LockIcon() {
  return (
    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  );
}

function RocketIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
    </svg>
  );
}
