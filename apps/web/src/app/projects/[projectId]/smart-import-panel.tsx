"use client";

import { useRef, useState } from "react";
import { useToast } from "@/components/toast-provider";
import type { SmartImportPreview, SmartImportResult } from "@/app/api/projects/[projectId]/smart-import/route";

type Section = "page-objects" | "requirements" | "test-plans" | "specs";

const SECTIONS: { id: Section; label: string; previewKey: keyof SmartImportPreview; icon: string }[] = [
  { id: "page-objects",  label: "Page Objects",  previewKey: "pageObjects",  icon: "🧩" },
  { id: "requirements",  label: "Requirements",  previewKey: "requirements", icon: "📋" },
  { id: "test-plans",    label: "Test Plans",    previewKey: "testPlans",    icon: "🗺️" },
  { id: "specs",         label: "Playwright Specs", previewKey: "specFiles", icon: "⚡" },
];

function sectionCount(preview: SmartImportPreview, key: keyof SmartImportPreview): number {
  return (preview[key] as unknown[]).length;
}

export function SmartImportPanel({
  projectId,
  onImported,
}: {
  projectId: string;
  onImported: () => void;
}) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"idle" | "previewing" | "importing" | "done">("idle");
  const [preview, setPreview] = useState<SmartImportPreview | null>(null);
  const [result, setResult] = useState<SmartImportResult | null>(null);
  const [selected, setSelected] = useState<Set<Section>>(new Set(["page-objects", "requirements", "test-plans", "specs"]));
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);

  function toggleSection(id: Section) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleFile(file: File) {
    if (!file.name.endsWith(".zip")) {
      toast.error("Please upload a .zip file exported from smart-generate");
      return;
    }
    setZipFile(file);
    setStep("previewing");
    setPreview(null);
    setResult(null);

    const form = new FormData();
    form.append("file", file);

    try {
      const res = await fetch(`/api/projects/${projectId}/smart-import`, {
        method: "PUT",
        body: form,
      });
      const body = (await res.json()) as { ok?: boolean; preview?: SmartImportPreview; error?: string };
      if (!res.ok || !body.preview) {
        toast.error(body.error ?? "Could not read ZIP file");
        setStep("idle");
        return;
      }
      setPreview(body.preview);
    } catch {
      toast.error("Failed to read ZIP file");
      setStep("idle");
    }
  }

  async function handleImport() {
    if (!zipFile || preview === null) return;
    setStep("importing");

    const form = new FormData();
    form.append("file", zipFile);
    form.append("sections", JSON.stringify([...selected]));

    try {
      const res = await fetch(`/api/projects/${projectId}/smart-import`, {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as { ok?: boolean; result?: SmartImportResult; error?: string };
      if (!res.ok || !body.result) {
        toast.error(body.error ?? "Import failed");
        setStep("previewing");
        return;
      }
      setResult(body.result);
      setStep("done");
      const total =
        body.result.pageObjects.imported +
        body.result.requirements.imported +
        body.result.testPlans.imported +
        body.result.specFiles.imported;
      toast.success(`Smart import complete — ${total} item${total !== 1 ? "s" : ""} imported`);
      onImported();
    } catch {
      toast.error("Import request failed");
      setStep("previewing");
    }
  }

  function reset() {
    setStep("idle");
    setPreview(null);
    setResult(null);
    setZipFile(null);
    setSelected(new Set(["page-objects", "requirements", "test-plans", "specs"]));
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-green-100 text-green-700">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0l-3 3m3-3l3 3M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 000-1.41l-2.34-2.34a1 1 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Smart Import</h2>
          <p className="text-xs text-slate-500">
            Upload a ZIP from{" "}
            <code className="rounded bg-slate-100 px-1 font-mono text-[11px]">smart-generate</code>{" "}
            CLI to import page objects, requirements, test plans and specs
          </p>
        </div>
        {step !== "idle" && (
          <button type="button" onClick={reset} className="ml-auto text-xs font-medium text-slate-400 hover:text-slate-700">
            Start over
          </button>
        )}
      </div>

      <div className="p-5 space-y-5">

        {/* ── Step 1: Drop zone ─────────────────────────────── */}
        {step === "idle" && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".zip"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }}
            />
            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const f = e.dataTransfer.files[0];
                if (f) void handleFile(f);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-8 py-14 text-center transition ${
                dragOver
                  ? "border-green-400 bg-green-50"
                  : "border-slate-200 hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">📦</div>
              <div>
                <p className="text-sm font-semibold text-slate-700">Drop your ZIP file here</p>
                <p className="mt-0.5 text-xs text-slate-400">or click to browse — exported from smart-generate CLI</p>
              </div>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                {SECTIONS.map((s) => (
                  <span key={s.id} className="rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-slate-500">
                    {s.icon} {s.label}
                  </span>
                ))}
              </div>
            </div>

            {/* CLI hint */}
            <div className="rounded-lg border border-slate-200 bg-slate-900 px-4 py-3">
              <p className="mb-1.5 text-[10px] font-medium text-slate-400 uppercase tracking-wider">Generate the ZIP using CLI</p>
              <code className="text-xs text-green-400 font-mono">
                npx @jagadeeshqtsolv/smart-generate --url https://myapp.com --user admin --pass secret
              </code>
            </div>
          </>
        )}

        {/* ── Step 2: Preview + section selection ──────────── */}
        {(step === "previewing" || step === "importing") && (
          <>
            {preview === null ? (
              <div className="flex items-center justify-center py-10 gap-2 text-sm text-slate-500">
                <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Reading ZIP…
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-slate-500">File:</span>
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">{zipFile?.name}</span>
                </div>

                <p className="text-xs font-semibold text-slate-700">Select sections to import:</p>

                <div className="grid gap-3 sm:grid-cols-2">
                  {SECTIONS.map((s) => {
                    const count = sectionCount(preview, s.previewKey);
                    const isSelected = selected.has(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={count === 0}
                        onClick={() => count > 0 && toggleSection(s.id)}
                        className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                          count === 0
                            ? "cursor-not-allowed border-slate-100 bg-slate-50 opacity-50"
                            : isSelected
                              ? "border-green-300 bg-green-50"
                              : "border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <span className="text-xl">{s.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${isSelected && count > 0 ? "text-green-800" : "text-slate-700"}`}>
                            {s.label}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {count === 0 ? "Not found in ZIP" : `${count} item${count !== 1 ? "s" : ""} found`}
                          </p>
                        </div>
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                          isSelected && count > 0 ? "border-green-500 bg-green-500" : "border-slate-300"
                        }`}>
                          {isSelected && count > 0 && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">
                    {selected.size === 0
                      ? "Select at least one section"
                      : `${[...selected].map((id) => SECTIONS.find((s) => s.id === id)?.label).join(", ")} will be imported`}
                  </p>
                  <button
                    type="button"
                    disabled={selected.size === 0 || step === "importing"}
                    onClick={() => void handleImport()}
                    className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-green-700 disabled:opacity-50"
                  >
                    {step === "importing" ? (
                      <>
                        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                        </svg>
                        Importing…
                      </>
                    ) : "Import Selected"}
                  </button>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Step 3: Result summary ───────────────────────── */}
        {step === "done" && result !== null && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100">
                <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-semibold text-slate-900">Import complete</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {SECTIONS.map((s) => {
                const key = s.id === "page-objects" ? "pageObjects"
                  : s.id === "requirements" ? "requirements"
                  : s.id === "test-plans" ? "testPlans"
                  : "specFiles";
                const r = result[key as keyof SmartImportResult];
                if (!selected.has(s.id)) return null;
                return (
                  <div key={s.id} className="rounded-xl border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-slate-700">{s.icon} {s.label}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        r.imported > 0 ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
                      }`}>
                        {r.imported} imported
                      </span>
                    </div>
                    {r.errors.length > 0 && (
                      <ul className="mt-2 space-y-0.5">
                        {r.errors.map((e, i) => (
                          <li key={i} className="text-[10px] text-rose-600">{e}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={reset}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Import another ZIP
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
