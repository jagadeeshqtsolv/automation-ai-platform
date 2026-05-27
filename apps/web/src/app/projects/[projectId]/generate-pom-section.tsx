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
      const data = (await res.json()) as { imported?: number; errors?: string[] };
      if (!res.ok) {
        toast.error(await readApiError(res, "Import failed"));
        return;
      }
      if (data.errors && data.errors.length > 0) {
        toast.error(`Import errors: ${data.errors.join("; ")}`);
      }
      toast.success(`Imported ${data.imported ?? 0} page object${(data.imported ?? 0) !== 1 ? "s" : ""}`);
      await onReloadProject();
      onFrameworkRefresh();
    } catch {
      toast.error("Import failed — unexpected error reading the file");
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    <section className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-white">Page object library</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Classes saved from the recorder or test codegen. Edit locators (<code className="text-zinc-300">L</code>) or
            methods, then save to sync <code className="text-zinc-300">frameworks/</code>.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.ts,.tsx"
            className="hidden"
            onChange={(e) => void handleImport(e)}
          />
          <button
            type="button"
            disabled={importing}
            onClick={() => fileInputRef.current?.click()}
            className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-zinc-300 hover:bg-white/10 disabled:opacity-50"
          >
            {importing ? "Importing…" : "⬆ Import from Recorder"}
          </button>
        </div>
      </header>

      {pageObjects.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No saved page objects yet. Use the <strong className="font-medium text-zinc-400">Recorder</strong> tab to
          capture screens from a connected device.
        </p>
      ) : (
        <ul className="space-y-2 max-h-[55vh] overflow-auto">
          {pageObjects.map((p) => (
            <li key={p.id} className="rounded-lg border border-white/10 bg-ink-950/30 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white">
                    {p.className}{" "}
                    <span className="block text-xs font-normal text-zinc-500 truncate">{p.modulePath}</span>
                  </p>
                  <p className="mt-1 max-h-10 overflow-hidden text-[11px] text-zinc-400 whitespace-pre-wrap">
                    {p.methodSummary || "—"}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center sm:gap-3">
                  <button
                    type="button"
                    className="text-xs text-accent hover:underline disabled:opacity-40"
                    disabled={busy !== null || deletingId !== null}
                    onClick={() => onEditPage(editingPageId === p.id ? null : p.id)}
                  >
                    {editingPageId === p.id ? "Close" : "Edit class"}
                  </button>
                  <button
                    type="button"
                    className="text-xs text-rose-300 hover:underline disabled:opacity-40"
                    disabled={busy !== null || deletingId !== null}
                    onClick={() => void deletePageObject(p)}
                  >
                    {deletingId === p.id ? "Deleting…" : "Delete"}
                  </button>
                </div>
              </div>
              <PageObjectEditor
                projectId={projectId}
                page={p}
                disabled={busy !== null}
                isOpen={editingPageId === p.id}
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
