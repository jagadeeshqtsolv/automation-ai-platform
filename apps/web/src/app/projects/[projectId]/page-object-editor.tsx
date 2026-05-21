"use client";

import { useEffect, useState } from "react";
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
  page,
  disabled,
  isOpen,
  onClose,
  onSaved,
  onDeleted,
}: {
  projectId: string;
  page: PageObjectSummary;
  disabled: boolean;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onDeleted: () => Promise<void>;
}) {
  const toast = useToast();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await fetch(`/api/projects/${projectId}/page-objects/${page.id}`);
      if (!res.ok) {
        if (!cancelled) toast.error("Could not load page object");
        return;
      }
      const body = (await res.json()) as { content?: string };
      if (!cancelled) {
        setContent(typeof body.content === "string" ? body.content : "");
      }
    })().finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, page.id, projectId, toast]);

  async function save() {
    if (content.trim().length === 0) {
      toast.error("Class content cannot be empty");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/page-objects/${page.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save page object"));
        return;
      }
      await onSaved();
      onClose();
      toast.success(`${page.className} saved`);
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    const confirmed = window.confirm(`Delete ${page.className} (${page.modulePath})?`);
    if (!confirmed) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/page-objects/${page.id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not delete page object"));
        return;
      }
      await onDeleted();
      onClose();
      toast.success(`${page.className} deleted`);
    } finally {
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 sm:items-center">
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-white/10 bg-ink-900 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="page-object-editor-title"
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h2 id="page-object-editor-title" className="text-sm font-semibold text-white">
            Edit {page.className}
          </h2>
          <button type="button" onClick={onClose} className="text-xs text-zinc-400 hover:text-white">
            Close
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading ? (
            <p className="text-sm text-zinc-400">Loading…</p>
          ) : (
            <textarea
              value={content}
              disabled={disabled || saving}
              onChange={(e) => setContent(e.target.value)}
              rows={22}
              className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-2 font-mono text-[11px] leading-relaxed text-zinc-100 outline-none ring-accent/30 focus:ring-2"
            />
          )}
        </div>
        <div className="flex flex-wrap gap-2 border-t border-white/10 px-4 py-3">
          <button
            type="button"
            disabled={disabled || saving || loading}
            onClick={() => void save()}
            className="ui-btn-primary ui-btn-xs disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="ui-btn-secondary ui-btn-xs"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled || saving}
            onClick={() => void remove()}
            className="ml-auto rounded-lg border border-rose-500/30 px-3 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
