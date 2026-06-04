"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";
import { PageObjectEditor } from "./page-object-editor";

type PageObjectRow = {
  id: string;
  className: string;
  modulePath: string;
  methodSummary: string;
};

export function GeneratePomSection({
  projectId,
  pageObjects,
  busy,
  editingPageId,
  onEditPage,
  onReload,
  onReloadProject,
  onFrameworkRefresh,
}: {
  projectId: string;
  pageObjects: PageObjectRow[];
  busy: string | null;
  editingPageId: string | null;
  onEditPage: (id: string | null) => void;
  onReload: () => Promise<void>;
  onReloadProject: () => Promise<void>;
  onFrameworkRefresh: () => void;
}) {
  const toast = useToast();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deletingAll, setDeletingAll] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      let bundle: unknown;

      if (file.name.endsWith(".ts") || file.name.endsWith(".tsx")) {
        // Single TypeScript page-object file — wrap it in the bundle format
        const classMatch = /export\s+class\s+(\w+)/.exec(text);
        if (!classMatch) {
          toast.error("Import failed — no exported class found in the TypeScript file");
          return;
        }
        const className = classMatch[1];
        const modulePath = `pageobjects/${className}.ts`;
        bundle = { pageObjects: [{ className, modulePath, content: text }] };
      } else {
        // JSON bundle (recorder export)
        try {
          bundle = JSON.parse(text) as unknown;
        } catch {
          toast.error("Import failed — file is not valid JSON. Upload a .ts page object file or a .json bundle.");
          return;
        }
      }

      const res = await fetch(`/api/projects/${projectId}/page-objects/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bundle),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Import failed"));
        return;
      }
      const data = (await res.json()) as { imported?: number; errors?: string[] };
      if (data.errors && data.errors.length > 0) {
        toast.error(`Import errors: ${data.errors.join("; ")}`);
      }
      if ((data.imported ?? 0) > 0) {
        toast.success(`Imported ${data.imported ?? 0} page object${(data.imported ?? 0) !== 1 ? "s" : ""}`);
      }
      try {
        await onReloadProject();
        onFrameworkRefresh();
      } catch {
        /* reload failure is non-fatal — the import itself succeeded */
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      toast.error(msg.length > 0 ? `Import failed — ${msg}` : "Import failed — unexpected error");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function deleteAllPageObjects() {
    const confirmed = window.confirm(
      `Delete all ${pageObjects.length} page object${pageObjects.length !== 1 ? "s" : ""}? This cannot be undone.`,
    );
    if (!confirmed) return;
    setDeletingAll(true);
    try {
      await Promise.all(
        pageObjects.map((p) =>
          fetch(`/api/projects/${projectId}/page-objects/${p.id}`, { method: "DELETE" }),
        ),
      );
      if (editingPageId !== null) onEditPage(null);
      await onReloadProject();
      onFrameworkRefresh();
      toast.success("All page objects deleted");
    } catch {
      toast.error("Could not delete all page objects");
    } finally {
      setDeletingAll(false);
    }
  }

  async function deletePageObject(page: PageObjectRow) {
    const confirmed = window.confirm(
      `Delete ${page.className}?\n\nThis removes the database record and deletes ${page.modulePath} from your framework folder.`,
    );
    if (!confirmed) return;

    setDeletingId(page.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/page-objects/${page.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not delete page object"));
        return;
      }
      if (editingPageId === page.id) onEditPage(null);
      await onReloadProject();
      onFrameworkRefresh();
      toast.success(`${page.className} deleted`);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
              <path strokeLinecap="round" d="M4 7h16M4 12h10M4 17h14" />
              <rect x="15" y="10" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.15" />
              <rect x="15" y="10" width="5" height="5" rx="1" />
            </svg>
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">Page Object Library</h2>
            <p className="text-xs text-slate-500">
              {pageObjects.length > 0
                ? `${pageObjects.length} class${pageObjects.length !== 1 ? "es" : ""} — edit locators or methods, then save to sync`
                : "Classes saved from the recorder or test codegen"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileInputRef} type="file" accept=".json,.ts,.tsx" className="hidden" onChange={(e) => void handleImport(e)} />
          {pageObjects.length > 0 && (
            <button
              type="button"
              disabled={busy !== null || deletingId !== null || deletingAll}
              onClick={() => void deleteAllPageObjects()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {deletingAll ? "Deleting…" : "Delete All"}
            </button>
          )}
          {pageObjects.length > 0 && (
            <button
              type="button"
              disabled={busy !== null || deletingId !== null}
              onClick={() => onEditPage(pageObjects[0]?.id ?? null)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Open Editor
            </button>
          )}
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {importing ? "Importing…" : "Import"}
          </button>
        </div>
      </div>

      {/* List */}
      <div className="px-5 pb-5">
        {pageObjects.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-2xl">🧩</div>
            <p className="mt-3 text-sm font-medium text-slate-700">No page objects yet</p>
            <p className="mt-1 text-xs text-slate-500">Use the Recorder tab to capture screens, or import a .ts file.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pageObjects.map((p, idx) => {
              const methods = p.methodSummary ? p.methodSummary.split(",").map((m) => m.trim()).filter(Boolean) : [];
              return (
                <div key={p.id} className="flex items-start gap-4 py-3 first:pt-0 last:pb-0">
                  {/* Index */}
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-bold text-slate-500">
                    {idx + 1}
                  </span>
                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-slate-900">{p.className}</p>
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">.ts</span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{p.modulePath}</p>
                    {methods.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {methods.slice(0, 6).map((m) => (
                          <span key={m} className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
                            {m}
                          </span>
                        ))}
                        {methods.length > 6 && (
                          <span className="rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] text-slate-400">
                            +{methods.length - 6} more
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      disabled={busy !== null || deletingId !== null}
                      onClick={() => onEditPage(p.id)}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 shadow-xs hover:bg-slate-50 hover:border-slate-300 disabled:opacity-40"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      disabled={busy !== null || deletingId !== null}
                      onClick={() => void deletePageObject(p)}
                      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-40"
                    >
                      {deletingId === p.id ? "…" : "Delete"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-panel editor — opens over the page when any Edit Class is clicked */}
      <PageObjectEditor
        projectId={projectId}
        pageObjects={pageObjects}
        initialPageId={editingPageId}
        disabled={busy !== null}
        isOpen={editingPageId !== null}
        onClose={() => onEditPage(null)}
        onSaved={async () => {
          await onReload();
          onFrameworkRefresh();
        }}
        onDeleted={async () => {
          await onReloadProject();
          onFrameworkRefresh();
        }}
      />
    </section>
  );
}
