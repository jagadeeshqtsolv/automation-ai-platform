"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";

type AuthFile = {
  filename: string;
  sizeBytes: number;
  updatedAt: string | null;
};

const AUTH_STEPS = [
  {
    number: 1,
    title: "Generate page objects",
    description:
      "Go to the Page Objects section and run page object generation. An auth file is generated automatically as part of that process.",
  },
  {
    number: 2,
    title: "Upload the generated auth file",
    description:
      'Once generation completes, download the auth.json file and upload it using the Import button above.',
  },
  {
    number: 3,
    title: "Auth is applied automatically",
    description:
      "If an auth file is already uploaded, it will be used automatically in all generated test plans, test cases, and test scripts — no login steps needed.",
  },
] as const;

export function ProjectAuthSettings({
  projectId,
  disabled,
}: {
  projectId: string;
  disabled: boolean;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [files, setFiles] = useState<AuthFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [deletingFile, setDeletingFile] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/auth-files`);
      if (!res.ok) return;
      const body = (await res.json()) as { files: AuthFile[] };
      setFiles(body.files);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".json")) {
      toast.error("Only .json auth files are supported.");
      return;
    }

    setImporting(true);
    try {
      const text = await file.text();

      // Validate JSON before sending
      try {
        JSON.parse(text);
      } catch {
        toast.error("Import failed — file is not valid JSON.");
        return;
      }

      const res = await fetch(`/api/projects/${projectId}/auth-files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: file.name, content: text }),
      });

      if (!res.ok) {
        toast.error(await readApiError(res, "Import failed"));
        return;
      }

      toast.success(`"${file.name}" imported and stored in .auth/`);
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg.length > 0 ? `Import failed — ${msg}` : "Import failed — unexpected error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(filename: string) {
    if (!window.confirm(`Delete "${filename}"? This cannot be undone.`)) return;
    setDeletingFile(filename);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/auth-files/${encodeURIComponent(filename)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not delete auth file"));
        return;
      }
      toast.success(`"${filename}" deleted`);
      await load();
    } finally {
      setDeletingFile(null);
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  function formatDate(iso: string | null): string {
    if (!iso) return "—";
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  return (
    <div className="space-y-4">

      {/* ── Info card ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-2">
        <h3 className="text-sm font-semibold text-slate-900">Auth Files</h3>
        <p className="text-xs text-slate-500">
          Import a Playwright <code className="text-slate-600">storageState</code> JSON file
          (e.g. <code className="text-slate-600">auth.json</code>). Imported files are stored
          in the <code className="text-slate-600">.auth/</code> folder of your framework and
          can be referenced in <code className="text-slate-600">playwright.config.ts</code>{" "}
          via <code className="text-slate-600">use.storageState</code>.
        </p>
        <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-500 font-mono">
          {`// playwright.config.ts\nuse: { storageState: ".auth/auth.json" }`}
        </div>
      </div>

      {/* ── File list ────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Imported Auth Files</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Stored under <code className="text-slate-600">.auth/</code> in your framework.
            </p>
          </div>

          <button
            type="button"
            disabled={disabled || importing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
            data-testid="auth-import-btn"
          >
            {importing ? <><Spinner />Importing…</> : <><UploadIcon />Import .json</>}
          </button>

          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={(e) => void handleImport(e)}
          />
        </div>

        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : files.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 px-4 py-6 text-center">
            <p className="text-xs text-slate-400">No auth files imported yet.</p>
            <p className="mt-1 text-[11px] text-slate-400">
              Click <span className="font-semibold">Import .json</span> to add a Playwright storageState file.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100" data-testid="auth-file-list">
            {files.map((f) => (
              <li key={f.filename} className="flex items-center gap-3 py-2.5">
                <FileIcon />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900" title={f.filename}>
                    {f.filename}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {formatSize(f.sizeBytes)} &middot; {formatDate(f.updatedAt)}
                  </p>
                </div>
                <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  .auth/{f.filename}
                </span>
                <button
                  type="button"
                  disabled={disabled || deletingFile === f.filename}
                  onClick={() => void handleDelete(f.filename)}
                  className="shrink-0 rounded-lg border border-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50 transition"
                  data-testid={`auth-delete-${f.filename}`}
                >
                  {deletingFile === f.filename ? "Deleting…" : "Delete"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── How to generate ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="px-5 pt-5 pb-4 border-b border-slate-100">
          <h3 className="text-sm font-semibold text-slate-900">How to generate an auth file</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            Auth files are generated alongside page objects in the core section.
          </p>
        </div>
        <ol className="divide-y divide-slate-100">
          {AUTH_STEPS.map((step) => (
            <li key={step.number} className="flex gap-4 px-5 py-4">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                {step.number}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900">{step.title}</p>
                <p className="mt-0.5 text-xs text-slate-500 leading-relaxed">{step.description}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />
  );
}

function UploadIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M16 12l-4-4m0 0l-4 4m4-4v12" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}
