"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";

export function ProjectHeaderActions({ projectId, projectName }: { projectId: string; projectName: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

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
    <button
      type="button"
      disabled={busy}
      onClick={() => void deleteProject()}
      className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:opacity-50"
    >
      {busy ? "Deleting…" : "Delete project"}
    </button>
  );
}
