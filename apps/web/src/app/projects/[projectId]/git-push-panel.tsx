"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";
import { Portal } from "@/components/portal";

type ChangedFile = {
  status: string;
  path: string;
  label: "modified" | "added" | "deleted" | "untracked" | "renamed" | "other";
};

const LABEL_COLOR: Record<ChangedFile["label"], string> = {
  modified:  "text-amber-700",
  added:     "text-emerald-700",
  deleted:   "text-rose-600",
  untracked: "text-sky-700",
  renamed:   "text-violet-700",
  other:     "text-slate-500",
};

const LABEL_ABBR: Record<ChangedFile["label"], string> = {
  modified:  "M",
  added:     "A",
  deleted:   "D",
  untracked: "?",
  renamed:   "R",
  other:     "~",
};

export function GitPushPanel({
  projectId,
  open,
  onClose,
  onPushed,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
  onPushed?: (prUrl: string | null) => void;
}) {
  const toast = useToast();
  const [files, setFiles]               = useState<ChangedFile[]>([]);
  const [selected, setSelected]         = useState<Set<string>>(new Set());
  const [message, setMessage]           = useState("");
  const [loading, setLoading]           = useState(false);
  const [loadError, setLoadError]       = useState<string | null>(null);
  const [pushing, setPushing]           = useState(false);
  const [fetching, setFetching]         = useState(false);
  const [discarding, setDiscarding]     = useState(false);
  // path of file pending discard confirmation, or "selected" for bulk discard
  const [confirmDiscard, setConfirmDiscard] = useState<string | "selected" | null>(null);
  const [fetchResult, setFetchResult]   = useState<{ newCommits: boolean; output: string } | null>(null);
  const [prUrl, setPrUrl]               = useState<string | null>(null);
  // diff pane
  const [previewFile, setPreviewFile]         = useState<ChangedFile | null>(null);
  const [previewDiff, setPreviewDiff]         = useState<string | null>(null);
  const [previewIsNew, setPreviewIsNew]       = useState(false);
  const [previewIsDeleted, setPreviewIsDeleted] = useState(false);
  const [previewLoading, setPreviewLoading]   = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  const loadFiles = useCallback(async () => {
    if (!open) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git-config/files`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(body.error ?? `Server error ${res.status}`);
        return;
      }
      const body = (await res.json()) as { files: ChangedFile[] };
      setFiles(body.files);
      setSelected(new Set(body.files.map((f) => f.path)));
      setPrUrl(null);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Failed to load files");
    } finally {
      setLoading(false);
    }
  }, [open, projectId]);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  // Lock body scroll while panel is open so the workspace can't be seen scrolling behind
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (previewFile) { setPreviewFile(null); setPreviewDiff(null); }
        else onClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, previewFile]);

  function toggleFile(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  function toggleAll() {
    setSelected(selected.size === files.length ? new Set() : new Set(files.map((f) => f.path)));
  }

  async function selectPreview(file: ChangedFile) {
    setPreviewFile(file);
    setPreviewDiff(null);
    setPreviewIsNew(false);
    setPreviewIsDeleted(false);
    setPreviewLoading(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/git-config/diff?path=${encodeURIComponent(file.path)}`,
      );
      if (!res.ok) { setPreviewDiff("(could not load diff)"); return; }
      const body = (await res.json()) as { diff: string; isNew?: boolean; isDeleted?: boolean };
      setPreviewDiff(body.diff || "(no diff — file is empty or binary)");
      setPreviewIsNew(body.isNew ?? false);
      setPreviewIsDeleted(body.isDeleted ?? false);
    } catch {
      setPreviewDiff("(error loading diff)");
    } finally {
      setPreviewLoading(false);
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
      await loadFiles();
      toast.success(body.newCommits ? "Fetched — remote has new commits" : "Fetched — already up to date");
    } finally {
      setFetching(false);
    }
  }

  async function onDiscard(filePaths: string[]) {
    if (filePaths.length === 0) return;
    setDiscarding(true);
    setConfirmDiscard(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/git-config/discard`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: filePaths }),
      });
      if (!res.ok) { toast.error(await readApiError(res, "Discard failed")); return; }
      const body = (await res.json()) as { discarded: string[] };
      toast.success(
        body.discarded.length === 1
          ? `Discarded changes to ${body.discarded[0]}`
          : `Discarded changes to ${body.discarded.length} files`,
      );
      // Clear discarded paths from selection
      setSelected((prev) => {
        const next = new Set(prev);
        body.discarded.forEach((p) => next.delete(p));
        return next;
      });
      if (previewFile && body.discarded.includes(previewFile.path)) {
        setPreviewFile(null);
        setPreviewDiff(null);
      }
      await loadFiles();
    } finally {
      setDiscarding(false);
    }
  }

  async function onPush() {
    if (selected.size === 0) { toast.error("Select at least one file to push"); return; }
    setPushing(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/git-config/push`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: Array.from(selected),
          message: message.trim() || undefined,
        }),
      });
      if (!res.ok) { toast.error(await readApiError(res, "Push failed")); return; }
      const body = (await res.json()) as { committed: boolean; pushed: boolean; prUrl: string | null };
      toast.success(body.committed ? "Changes pushed to your branch" : "Nothing new — branch is already up to date");
      setPrUrl(body.prUrl);
      setMessage("");
      onPushed?.(body.prUrl);
      await loadFiles();
    } finally {
      setPushing(false);
    }
  }

  if (!open) return null;

  const hasDiffPane = previewFile !== null;

  return (
    <Portal>
      {/* Backdrop — fully opaque so the workspace behind is completely hidden */}
      <div
        ref={overlayRef}
        className="fixed inset-0 z-40 bg-white"
        onClick={onClose}
        aria-hidden
      />

      {/* Shell — narrow without preview, full-width split with preview */}
      <div
        className={`fixed inset-y-0 left-0 z-50 flex flex-row bg-white shadow-xl ring-1 ring-slate-200 transition-[width] duration-200 ${
          hasDiffPane ? "right-0" : "w-full max-w-sm"
        }`}
        role="dialog"
        aria-label="Push Changes"
      >
        {/* ── LEFT PANE: file list ────────────────────────────────────── */}
        <aside className={`flex flex-col ${hasDiffPane ? "w-72 shrink-0 border-r border-slate-200" : "flex-1"}`}>

          {/* Header */}
          <div className="border-b border-slate-200 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Push Changes</h2>
                <p className="text-[11px] text-slate-500">Select files and push to your branch</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={fetching || pushing}
                  onClick={() => void onFetch()}
                  className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50 transition"
                  data-testid="git-push-fetch-btn"
                >
                  <FetchIcon />
                  {fetching ? "Fetching…" : "Fetch"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                  aria-label="Close"
                  data-testid="git-push-close-btn"
                >
                  <CloseIcon />
                </button>
              </div>
            </div>
            {fetchResult !== null && (
              <div className={`mt-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-mono break-all ${
                fetchResult.newCommits
                  ? "border-sky-200 bg-sky-50 text-sky-700"
                  : "border-slate-200 bg-slate-50 text-slate-500"
              }`}>
                {fetchResult.output}
              </div>
            )}
          </div>

          {/* File list body */}
          <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {loading ? (
              <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-zinc-400" />
                Loading…
              </div>
            ) : loadError !== null ? (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs text-rose-600">
                <p className="font-semibold">Could not load files</p>
                <p className="mt-1 text-rose-600/80">{loadError}</p>
                <button
                  type="button"
                  onClick={() => void loadFiles()}
                  className="mt-2 rounded-lg border border-slate-200 px-3 py-1.5 font-semibold text-slate-600 hover:bg-slate-50"
                  data-testid="git-push-retry-btn"
                >
                  Retry
                </button>
              </div>
            ) : files.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
                No changed files — working tree is clean.
              </p>
            ) : (
              <>
                <div className="flex items-center justify-between text-[11px] text-slate-500">
                  <span>{files.length} file{files.length === 1 ? "" : "s"} changed</span>
                  <button type="button" onClick={toggleAll} className="text-slate-500 hover:text-slate-900" data-testid="git-push-toggle-all-btn">
                    {selected.size === files.length ? "Deselect All" : "Select All"}
                  </button>
                </div>

                <ul className="rounded-xl border border-slate-200 bg-white">
                  {files.map((f) => (
                    <li
                      key={f.path}
                      className={`group flex items-center border-b border-slate-200 last:border-0 ${
                        previewFile?.path === f.path ? "bg-slate-50" : "hover:bg-slate-50"
                      }`}
                    >
                      {/* Checkbox */}
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[11px]">
                        <input
                          type="checkbox"
                          checked={selected.has(f.path)}
                          onChange={() => toggleFile(f.path)}
                          className="h-3 w-3 rounded border-slate-200 bg-white accent-accent"
                        />
                        <span className={`w-3.5 shrink-0 font-mono font-bold text-[10px] ${LABEL_COLOR[f.label]}`} title={f.label}>
                          {LABEL_ABBR[f.label]}
                        </span>
                      </label>
                      {/* File name — clicking opens diff pane */}
                      <button
                        type="button"
                        onClick={() => void selectPreview(f)}
                        className="min-w-0 flex-1 py-2 text-left"
                        title={f.path}
                      >
                        <span className={`block truncate font-mono text-[11px] ${
                          previewFile?.path === f.path ? "text-slate-900" : "text-slate-600 group-hover:text-slate-900"
                        }`}>
                          {f.path}
                        </span>
                      </button>
                      {/* Per-file discard button */}
                      {confirmDiscard === f.path ? (
                        <span className="flex shrink-0 items-center gap-1 pr-2">
                          <span className="text-[10px] text-slate-500">Discard?</span>
                          <button
                            type="button"
                            onClick={() => void onDiscard([f.path])}
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-rose-100 text-rose-600 hover:bg-rose-500/30"
                          >Yes</button>
                          <button
                            type="button"
                            onClick={() => setConfirmDiscard(null)}
                            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-600"
                          >No</button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDiscard(f.path)}
                          disabled={discarding || pushing}
                          className="mr-2 shrink-0 rounded p-1 text-slate-500 opacity-0 group-hover:opacity-100 hover:bg-rose-100 hover:text-rose-600 disabled:hidden transition"
                          title="Discard Changes"
                          data-testid={`git-discard-file-btn-${f.path}`}
                        >
                          <DiscardIcon />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {/* Commit message */}
            <label className="block text-xs text-slate-500">
              Commit message <span className="text-slate-500">(optional)</span>
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="chore: sync test framework"
                maxLength={500}
                className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-green-400 focus:outline-none"
                data-testid="git-push-commit-message-input"
              />
            </label>

            {prUrl !== null && (
              <a
                href={prUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-medium text-green-700 hover:bg-green-100"
                data-testid="git-push-create-pr-link"
              >
                <PrIcon />
                Create pull request →
              </a>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 p-3 space-y-2">
            {/* Discard selected — shown when files are selected */}
            {selected.size > 0 && (
              confirmDiscard === "selected" ? (
                <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2">
                  <span className="flex-1 text-xs text-rose-600">
                    Discard Changes to {selected.size} file{selected.size === 1 ? "" : "s"}? This cannot be undone.
                  </span>
                  <button
                    type="button"
                    onClick={() => void onDiscard(Array.from(selected))}
                    disabled={discarding}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold bg-rose-500/25 text-rose-600 hover:bg-rose-500/35 disabled:opacity-50"
                    data-testid="git-discard-confirm-btn"
                  >
                    {discarding ? "Discarding…" : "Discard"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDiscard(null)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:text-slate-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDiscard("selected")}
                  disabled={discarding || pushing}
                  className="w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50 transition"
                  data-testid="git-discard-selected-btn"
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <DiscardIcon />
                    Discard {selected.size} selected file{selected.size === 1 ? "" : "s"}
                  </span>
                </button>
              )
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void onPush()}
                disabled={pushing || files.length === 0 || selected.size === 0}
                className="ui-btn-primary flex-1 disabled:opacity-50"
                data-testid="git-push-submit-btn"
              >
                {pushing ? (
                  <>
                    <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 " />
                    Pushing…
                  </>
                ) : (
                  <>
                    <PushIcon />
                    Push {selected.size > 0 ? `${selected.size} file${selected.size === 1 ? "" : "s"}` : ""}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void loadFiles()}
                disabled={loading || pushing}
                className="ui-btn-secondary !px-3 disabled:opacity-50"
                title="Refresh"
                data-testid="git-push-refresh-btn"
              >
                <RefreshIcon />
              </button>
            </div>
          </div>
        </aside>

        {/* ── RIGHT PANE: diff viewer ─────────────────────────────────── */}
        {hasDiffPane && (
          <div className="flex min-w-0 flex-1 flex-col">

            {/* Diff header */}
            <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
              <span className={`shrink-0 w-5 text-center font-mono text-xs font-bold ${LABEL_COLOR[previewFile.label]}`}>
                {LABEL_ABBR[previewFile.label]}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-sm text-slate-700" title={previewFile.path}>
                {previewFile.path}
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                previewFile.label === "added" || previewFile.label === "untracked"
                  ? "bg-emerald-100 text-emerald-700"
                  : previewFile.label === "deleted"
                  ? "bg-rose-100 text-rose-600"
                  : previewFile.label === "renamed"
                  ? "bg-violet-100 text-violet-700"
                  : "bg-amber-100 text-amber-600"
              }`}>
                {previewFile.label}
              </span>
              <button
                type="button"
                onClick={() => { setPreviewFile(null); setPreviewDiff(null); }}
                className="shrink-0 rounded-lg p-1.5 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                aria-label="Close diff"
                data-testid="git-push-close-diff-btn"
              >
                <CloseIcon />
              </button>
            </div>

            {/* New / deleted file banner */}
            {!previewLoading && previewIsNew && (
              <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-1.5 text-[11px] text-emerald-700">
                New file — entire content shown as additions (no previous version in git history)
              </div>
            )}
            {!previewLoading && previewIsDeleted && (
              <div className="border-b border-rose-200 bg-rose-50 px-4 py-1.5 text-[11px] text-rose-600">
                Deleted file — showing last committed content
              </div>
            )}

            {/* Stats bar */}
            {previewDiff && !previewLoading && !previewIsNew && !previewIsDeleted && (
              <DiffStats diff={previewDiff} />
            )}

            {/* Diff content */}
            <div className="min-h-0 flex-1 overflow-auto">
              {previewLoading ? (
                <div className="flex items-center gap-2 px-6 py-10 text-sm text-slate-500">
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-200 border-t-zinc-400" />
                  Loading diff…
                </div>
              ) : (
                <DiffView diff={previewDiff ?? ""} />
              )}
            </div>
          </div>
        )}
      </div>
    </Portal>
  );
}

// ─── Diff stats bar (additions / deletions count) ─────────────────────────────

function DiffStats({ diff }: { diff: string }) {
  let additions = 0, deletions = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions++;
    else if (line.startsWith("-") && !line.startsWith("---")) deletions++;
  }
  if (additions === 0 && deletions === 0) return null;
  return (
    <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-1.5 text-[11px]">
      {additions > 0 && (
        <span className="font-mono font-semibold text-emerald-700">+{additions}</span>
      )}
      {deletions > 0 && (
        <span className="font-mono font-semibold text-rose-600">−{deletions}</span>
      )}
    </div>
  );
}

// ─── Diff renderer ─────────────────────────────────────────────────────────────

function DiffView({ diff }: { diff: string }) {
  if (!diff) return <p className="px-6 py-8 text-sm text-slate-500">(no changes)</p>;

  const lines = diff.split("\n");
  let addLine = 0, delLine = 0;

  // Parse hunk headers to track line numbers
  const parsed = lines.map((raw) => {
    const isAdd    = raw.startsWith("+") && !raw.startsWith("+++");
    const isDel    = raw.startsWith("-") && !raw.startsWith("---");
    const isHunk   = raw.startsWith("@@");
    const isHeader = raw.startsWith("diff ") || raw.startsWith("index ") || raw.startsWith("---") || raw.startsWith("+++");

    let lineNo = "";
    if (isHunk) {
      const m = raw.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (m) { delLine = parseInt(m[1]!); addLine = parseInt(m[2]!); }
    } else if (isAdd) {
      lineNo = String(addLine++);
    } else if (isDel) {
      lineNo = String(delLine++);
    } else if (!isHeader) {
      addLine++; delLine++;
    }

    return { raw, isAdd, isDel, isHunk, isHeader, lineNo };
  });

  return (
    <table className="w-full border-collapse font-mono text-[12px] leading-5">
      <tbody>
        {parsed.map((l, i) => (
          <tr
            key={i}
            className={
              l.isAdd  ? "bg-emerald-50 hover:bg-emerald-50" :
              l.isDel  ? "bg-rose-50 hover:bg-rose-50" :
              l.isHunk ? "bg-sky-50" :
              "hover:bg-slate-50"
            }
          >
            {/* Line number */}
            <td className={`select-none w-10 px-2 py-0 text-right text-[10px] border-r border-slate-200 ${
              l.isAdd ? "text-emerald-700" : l.isDel ? "text-rose-700" : "text-slate-700"
            }`}>
              {l.lineNo}
            </td>
            {/* Gutter symbol */}
            <td className={`select-none w-5 px-1 py-0 text-center text-[11px] border-r border-slate-200 ${
              l.isAdd ? "text-emerald-500" : l.isDel ? "text-rose-500" : "text-slate-700"
            }`}>
              {l.isAdd ? "+" : l.isDel ? "−" : l.isHunk ? "↕" : ""}
            </td>
            {/* Content */}
            <td className={`whitespace-pre-wrap break-all px-4 py-[1px] ${
              l.isAdd    ? "text-emerald-700" :
              l.isDel    ? "text-rose-700" :
              l.isHunk   ? "text-sky-400 italic" :
              l.isHeader ? "text-slate-500" :
              "text-slate-600"
            }`}>
              {l.isAdd || l.isDel ? l.raw.slice(1) : l.raw}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
function DiscardIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
    </svg>
  );
}
function PushIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
    </svg>
  );
}
function RefreshIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0114-7.5M19 5a9 9 0 00-14 7.5" />
    </svg>
  );
}
function PrIcon() {
  return (
    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
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
