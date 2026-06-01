"use client";

import { useEffect, useState, useCallback } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";

type PageObjectSummary = {
  id: string;
  className: string;
  modulePath: string;
  methodSummary: string;
};

export function PageObjectEditor({
  projectId,
  pageObjects,
  initialPageId,
  disabled,
  isOpen,
  onClose,
  onSaved,
  onDeleted,
}: {
  projectId: string;
  pageObjects: PageObjectSummary[];
  initialPageId: string | null;
  disabled: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(initialPageId);
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = pageObjects.find((p) => p.id === selectedId) ?? pageObjects[0] ?? null;

  const loadContent = useCallback(async (pageId: string) => {
    setLoading(true);
    setContent("");
    try {
      const res = await fetch(`/api/projects/${projectId}/page-objects/${pageId}`);
      if (!res.ok) { toast.error("Could not load page object"); return; }
      const body = (await res.json()) as { content?: string };
      setContent(typeof body.content === "string" ? body.content : "");
    } finally {
      setLoading(false);
    }
  }, [projectId, toast]);

  useEffect(() => {
    if (!isOpen) return;
    const id = initialPageId ?? pageObjects[0]?.id ?? null;
    setSelectedId(id);
    if (id) void loadContent(id);
  }, [isOpen, initialPageId, pageObjects, loadContent]);

  function selectPage(id: string) {
    setSelectedId(id);
    void loadContent(id);
  }

  async function save() {
    if (!selected) return;
    if (content.trim().length === 0) { toast.error("Class content cannot be empty"); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/page-objects/${selected.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) { toast.error(await readApiError(res, "Could not save page object")); return; }
      await onSaved();
      toast.success(`${selected.className} saved`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selected) return;
    const confirmed = window.confirm(`Delete ${selected.className}?`);
    if (!confirmed) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/page-objects/${selected.id}`, { method: "DELETE" });
      if (!res.ok) { toast.error(await readApiError(res, "Could not delete page object")); return; }
      await onDeleted();
      // select next page object
      const remaining = pageObjects.filter((p) => p.id !== selected.id);
      if (remaining.length > 0) {
        selectPage(remaining[0]!.id);
      } else {
        onClose();
      }
      toast.success(`${selected.className} deleted`);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="flex h-full flex-col bg-white" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" d="M4 7h16M4 12h10M4 17h14" />
                <rect x="15" y="10" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.15" />
                <rect x="15" y="10" width="5" height="5" rx="1" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Page Object Library</h2>
              <p className="text-xs text-slate-500">{pageObjects.length} class{pageObjects.length !== 1 ? "es" : ""}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
            data-testid="page-object-editor-close-btn"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">

          {/* Left — class list */}
          <div className="w-64 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
            <div className="px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Classes</p>
            </div>
            <ul className="space-y-0.5 px-2 pb-3">
              {pageObjects.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => selectPage(p.id)}
                    className={`group w-full rounded-lg px-3 py-2 text-left transition-all duration-150 ${
                      selectedId === p.id
                        ? "bg-amber-50 text-amber-800 ring-1 ring-amber-200"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <p className="truncate text-xs font-semibold">{p.className}</p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-400">{p.modulePath}</p>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — editor */}
          <div className="flex min-w-0 flex-1 flex-col">
            {selected === null ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
                Select a class to view
              </div>
            ) : (
              <>
                {/* File path bar */}
                <div className="flex items-center gap-2 border-b border-slate-100 bg-white px-4 py-2">
                  <span className="font-mono text-xs text-slate-400">{selected.modulePath}</span>
                  <span className="ml-auto text-[10px] text-slate-400">TypeScript</span>
                </div>

                {/* Textarea */}
                <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-4">
                  {loading ? (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">Loading…</div>
                  ) : (
                    <textarea
                      value={content}
                      disabled={disabled || saving}
                      onChange={(e) => setContent(e.target.value)}
                      className="h-full w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 font-mono text-[12px] leading-relaxed text-slate-800 shadow-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20"
                      spellCheck={false}
                      data-testid="page-object-editor-content-textarea"
                    />
                  )}
                </div>

                {/* Footer actions */}
                <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-4 py-3">
                  <button
                    type="button"
                    disabled={disabled || saving || loading}
                    onClick={() => void save()}
                    className="ui-btn-primary ui-btn-sm disabled:opacity-50"
                    data-testid="page-object-editor-save-btn"
                  >
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={onClose}
                    className="ui-btn-secondary ui-btn-sm"
                    data-testid="page-object-editor-cancel-btn"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    disabled={disabled || saving}
                    onClick={() => void remove()}
                    className="ml-auto rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 disabled:opacity-50"
                    data-testid="page-object-editor-delete-btn"
                  >
                    Delete Class
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
