"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";

export function ProjectHeaderActions({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  // ── Rename state ───────────────────────────────────────────────────────────
  const [renaming, setRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(projectName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function startRename() {
    setNameInput(projectName);
    setRenaming(true);
    setTimeout(() => { inputRef.current?.select(); }, 30);
  }

  function cancelRename() {
    setRenaming(false);
    setNameInput(projectName);
  }

  async function saveRename() {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === projectName) { cancelRename(); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not rename project"));
        return;
      }
      toast.success("Project renamed");
      setRenaming(false);
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────
  async function deleteProject() {
    const confirmed = window.confirm(
      `Delete project "${projectName}"?\n\nThis removes all requirements, environments, page objects, and the local framework folder. This cannot be undone.`,
    );
    if (!confirmed) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not delete project"));
        return;
      }
      toast.success(`Project "${projectName}" deleted`);
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* ── Rename ── */}
      {renaming ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={inputRef}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void saveRename();
              if (e.key === "Escape") cancelRename();
            }}
            maxLength={120}
            disabled={saving}
            className="rounded-lg border border-accent/40 bg-ink-950/60 px-3 py-1.5 text-sm text-white focus:outline-none focus:ring-1 focus:ring-accent/50 disabled:opacity-50 w-56"
            data-testid="project-rename-input"
            autoFocus
          />
          <button
            type="button"
            onClick={() => void saveRename()}
            disabled={saving || !nameInput.trim()}
            className="rounded-lg bg-accent px-3 py-1.5 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50 transition"
            data-testid="project-rename-save-btn"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={cancelRename}
            disabled={saving}
            className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-zinc-400 hover:text-white disabled:opacity-50 transition"
            data-testid="project-rename-cancel-btn"
          >
            Cancel
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={startRename}
          disabled={busy}
          className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-sm font-semibold text-zinc-300 hover:bg-white/[0.07] hover:text-white disabled:opacity-50 transition"
          data-testid="project-rename-btn"
        >
          <PencilIcon />
          Rename
        </button>
      )}

      {/* ── Delete ── */}
      {!renaming && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void deleteProject()}
          className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
          data-testid="project-delete-btn"
        >
          {busy ? "Deleting…" : "Delete project"}
        </button>
      )}
    </div>
  );
}

function PencilIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 012.828 2.828L11.828 15.828a2 2 0 01-1.414.586H8v-2.414A2 2 0 018.586 12.5z" />
    </svg>
  );
}
