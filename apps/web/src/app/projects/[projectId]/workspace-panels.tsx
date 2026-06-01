"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast-provider";
import type { ProjectPlatformType } from "@jagadeeshqtsolv/core";
import { testRunnerDisplayName } from "@/lib/test-framework";
import type { WorkspaceTab } from "./project-workspace-nav";
import { WorkspaceTabIcon } from "./workspace-nav-icons";

// ── Requirement two-panel editor ─────────────────────────────────────────────

export function RequirementEditor({
  requirements,
  initialRequirementId,
  busy,
  isOpen,
  onClose,
  onUpdateRequirement,
  onDeleteRequirement,
  onGeneratePlan,
  onCreatePlan,
}: {
  requirements: Array<{ id: string; title: string | null; content: string; createdAt: string; testPlans: Array<{ id: string }> }>;
  initialRequirementId: string | null;
  busy: string | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateRequirement: (id: string, title: string, content: string) => Promise<void>;
  onDeleteRequirement: (id: string, title: string | null, planCount: number) => Promise<void>;
  onGeneratePlan: (id: string, options?: { testCaseTypes?: string[] }) => Promise<void>;
  onCreatePlan: (id: string, suiteName: string) => Promise<void>;
}) {
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(initialRequirementId ?? requirements[0]?.id ?? null);
  const selected = requirements.find((r) => r.id === selectedId) ?? requirements[0] ?? null;
  const [title, setTitle] = useState(selected?.title ?? "");
  const [content, setContent] = useState(selected?.content ?? "");
  const [saving, setSaving] = useState(false);
  const [showGenOptions, setShowGenOptions] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const generating = busy === `plan:${selectedId}`;

  useEffect(() => {
    if (!isOpen) return;
    const id = initialRequirementId ?? requirements[0]?.id ?? null;
    setSelectedId(id);
  }, [isOpen, initialRequirementId, requirements]);

  useEffect(() => {
    if (!selected) return;
    setTitle(selected.title ?? "");
    setContent(selected.content);
    setShowGenOptions(false);
    setSelectedTypes([]);
  }, [selected?.id]);

  function selectRequirement(id: string) {
    setSelectedId(id);
  }

  async function save() {
    if (!selected) return;
    if (content.trim().length === 0) { toast.error("Requirement text cannot be empty"); return; }
    setSaving(true);
    try {
      await onUpdateRequirement(selected.id, title, content);
      toast.success("Requirement saved");
    } finally {
      setSaving(false);
    }
  }

  async function deleteCurrent() {
    if (!selected) return;
    await onDeleteRequirement(selected.id, selected.title, selected.testPlans.length);
    const remaining = requirements.filter((r) => r.id !== selected.id);
    if (remaining.length > 0) setSelectedId(remaining[0]!.id);
    else onClose();
  }

  async function generatePlan() {
    if (!selected || selectedTypes.length === 0) { toast.error("Select at least one test case type"); return; }
    setShowGenOptions(false);
    await onGeneratePlan(selected.id, { testCaseTypes: selectedTypes });
  }

  if (!isOpen) return null;

  const typeOptions = [
    { value: "smoke", label: "Smoke", desc: "P0 sanity checks" },
    { value: "functional", label: "Functional", desc: "Happy paths" },
    { value: "negative", label: "Negative", desc: "Error paths" },
    { value: "edgecase", label: "Edge Cases", desc: "Boundaries" },
    { value: "e2e", label: "E2E", desc: "Full journeys" },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm">
      <div className="flex h-full flex-col bg-white" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-100 text-sky-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <path strokeLinecap="round" d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
                <path strokeLinecap="round" d="M9 12h6M9 16h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Requirements</h2>
              <p className="text-xs text-slate-500">{requirements.length} requirement{requirements.length !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-slate-900">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex min-h-0 flex-1">

          {/* Left — requirement list */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
            <div className="px-3 pt-3 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Requirements</p>
            </div>
            <ul className="space-y-0.5 px-2 pb-3">
              {requirements.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => selectRequirement(r.id)}
                    className={`w-full rounded-lg px-3 py-2.5 text-left transition-all duration-150 ${
                      selectedId === r.id
                        ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <p className="truncate text-xs font-semibold">{r.title ?? "Untitled requirement"}</p>
                    <div className="mt-0.5 flex items-center gap-2">
                      <p className="text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleDateString()}</p>
                      {r.testPlans.length > 0 && (
                        <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-semibold text-emerald-700">
                          {r.testPlans.length} plan{r.testPlans.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Right — editor */}
          <div className="flex min-w-0 flex-1 flex-col">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a requirement</div>
            ) : (
              <>
                {/* Title bar */}
                <div className="border-b border-slate-100 bg-white px-5 py-3">
                  <input
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Requirement title (optional)"
                    className="w-full bg-transparent text-base font-semibold text-slate-900 placeholder:text-slate-400 outline-none"
                  />
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {new Date(selected.createdAt).toLocaleString()} · {selected.testPlans.length} test plan{selected.testPlans.length !== 1 ? "s" : ""}
                  </p>
                </div>

                {/* Content */}
                <div className="min-h-0 flex-1 overflow-auto bg-slate-50 p-5">
                  {generating ? (
                    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                      <div className="flex items-center gap-3">
                        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-500" />
                        <p className="text-sm font-semibold text-sky-800">Generating test plan…</p>
                      </div>
                    </div>
                  ) : null}

                  {showGenOptions && !generating ? (
                    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-semibold text-sky-800">Select test case types</p>
                        <button type="button" onClick={() => setSelectedTypes(selectedTypes.length === typeOptions.length ? [] : typeOptions.map((t) => t.value))} className="text-[11px] text-slate-500 hover:text-slate-700">
                          {selectedTypes.length === typeOptions.length ? "Clear All" : "Select All"}
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {typeOptions.map((opt) => {
                          const checked = selectedTypes.includes(opt.value);
                          return (
                            <label key={opt.value} className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2.5 text-xs transition ${checked ? "border-sky-200 bg-sky-100 text-sky-800" : "border-slate-200 bg-white text-slate-600"}`}>
                              <input type="checkbox" checked={checked} onChange={() => setSelectedTypes((p) => p.includes(opt.value) ? p.filter((t) => t !== opt.value) : [...p, opt.value])} className="h-3.5 w-3.5 rounded" />
                              <span>
                                <span className="font-semibold">{opt.label}</span>
                                <span className="ml-1 text-[10px] text-slate-400">{opt.desc}</span>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                      <div className="flex gap-2">
                        <button type="button" disabled={selectedTypes.length === 0} onClick={() => void generatePlan()} className="ui-btn-primary ui-btn-sm disabled:opacity-50">Generate</button>
                        <button type="button" onClick={() => setShowGenOptions(false)} className="text-xs text-slate-500 hover:text-slate-900">Cancel</button>
                      </div>
                    </div>
                  ) : null}

                  <textarea
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder="Paste requirement text, acceptance criteria, or user stories…"
                    className="h-full min-h-[300px] w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20"
                  />
                </div>

                {/* Footer actions */}
                <div className="flex items-center gap-2 border-t border-slate-200 bg-white px-5 py-3">
                  <button type="button" disabled={saving || busy !== null} onClick={() => void save()} className="ui-btn-primary ui-btn-sm disabled:opacity-50">
                    {saving ? "Saving…" : "Save Changes"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void onCreatePlan(selected.id, selected.title ?? "Test Suite")} className="ui-btn-secondary ui-btn-sm disabled:opacity-50">
                    Create Test Plan
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => setShowGenOptions((v) => !v)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50">
                    {showGenOptions ? "Cancel" : "Generate Test Plan"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void deleteCurrent()} className="ml-auto rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50">
                    Delete
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

// ── End RequirementEditor ─────────────────────────────────────────────────────

type Requirement = {
  id: string;
  title: string | null;
  content: string;
  createdAt: string;
  testPlans: Array<{ id: string }>;
};

export type ProjectPanelsData = {
  environments: Array<{ id: string; name: string; slug: string }>;
  pageObjects: Array<{ id: string }>;
  requirements: Requirement[];
};

const METRIC_STYLES: Record<string, { tab: WorkspaceTab; color: string; border: string; ring: string }> = {
  Environments:  { tab: "setup",         color: "text-violet-700", border: "border-violet-200",  ring: "hover:ring-violet-200" },
  Requirements:  { tab: "requirements",  color: "text-sky-700",    border: "border-sky-200",     ring: "hover:ring-sky-200" },
  "Test Plans":  { tab: "test-plans",    color: "text-emerald-700",border: "border-emerald-200", ring: "hover:ring-emerald-200" },
  "Page Objects":{ tab: "generate-pom",  color: "text-amber-700",  border: "border-amber-200",   ring: "hover:ring-amber-200" },
  "Test Cases":  { tab: "test-plans",    color: "text-green-700",  border: "border-green-200",   ring: "hover:ring-green-200" },
};

const SHORTCUT_HOVER: Record<string, string> = {
  setup:            "hover:border-violet-200 hover:bg-violet-50",
  requirements:     "hover:border-sky-200 hover:bg-sky-50",
  recorder:         "hover:border-rose-200 hover:bg-rose-50",
  "generate-pom":   "hover:border-amber-200 hover:bg-amber-50",
  "test-plans":     "hover:border-emerald-200 hover:bg-emerald-50",
  "test-execution": "hover:border-green-200 hover:bg-green-50",
  "test-reports":   "hover:border-cyan-200 hover:bg-cyan-50",
  framework:        "hover:border-orange-200 hover:bg-orange-50",
};

export function WorkspaceOverviewPanel({
  project,
  platformType = "mobile",
  planCount,
  testCaseCount,
  onNavigate,
}: {
  project: ProjectPanelsData;
  platformType?: ProjectPlatformType;
  planCount: number;
  testCaseCount: number;
  onNavigate: (tab: WorkspaceTab) => void;
}) {
  const codegenLabel = testRunnerDisplayName(platformType);
  const cards = [
    { label: "Environments", value: project.environments.length, tab: "setup" as const },
    { label: "Requirements", value: project.requirements.length, tab: "requirements" as const },
    { label: "Test Plans", value: planCount, tab: "test-plans" as const },
    { label: "Page Objects", value: project.pageObjects.length, tab: "generate-pom" as const },
    { label: "Test Cases", value: testCaseCount, tab: "test-plans" as const },
  ];

  const shortcuts: Array<{ tab: WorkspaceTab; title: string; body: string }> = [
    { tab: "setup",           title: "Configure Project",   body: "OpenAI key, execution provider, and environment definitions." },
    { tab: "requirements",    title: "Write Requirements",  body: "Paste acceptance criteria and generate test plans." },
    { tab: "recorder",        title: "Recorder",            body: "Mobile: device accessibility tree. Web: headed browser and DOM capture." },
    { tab: "generate-pom",    title: "Page Objects",        body: "Browse and edit classes saved from the recorder." },
    { tab: "test-plans",      title: "Test Plan Library",   body: `Review generated plans and run ${codegenLabel} codegen.` },
    { tab: "test-execution",  title: "Run Tests",           body: "Select specs and stream live CLI logs." },
    { tab: "test-reports",    title: "Test Reports",        body: "HTML reports, pass/fail breakdown, and step details." },
    { tab: "framework",       title: "Framework Files",     body: "Inspect generated files on disk." },
  ];

  return (
    <section className="animate-slide-up space-y-6">
      {/* Metric cards */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => {
          const s = METRIC_STYLES[c.label] ?? { tab: "overview" as WorkspaceTab, color: "text-slate-700", border: "border-slate-200", ring: "hover:ring-slate-200" };
          return (
            <button
              key={c.label}
              type="button"
              onClick={() => onNavigate(c.tab)}
              className={`group rounded-xl border ${s.border} bg-white p-4 text-left shadow-sm transition-all duration-150 hover:shadow-md hover:ring-2 ${s.ring} hover:ring-offset-1`}
              data-testid={`overview-${c.tab}-metric-btn`}
            >
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{c.label}</p>
                <WorkspaceTabIcon tab={s.tab} active={false} />
              </div>
              <p className={`mt-3 text-3xl font-bold tabular-nums ${s.color}`}>{c.value}</p>
            </button>
          );
        })}
      </div>

      {/* Shortcut cards */}
      <div>
        <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
          <span className="h-px flex-1 bg-slate-200" />
          Quick Access
          <span className="h-px flex-1 bg-slate-200" />
        </h3>
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {shortcuts.map((s) => {
            const hoverCls = SHORTCUT_HOVER[s.tab] ?? "hover:border-slate-300 hover:bg-slate-50";
            return (
              <button
                key={`${s.tab}-${s.title}`}
                type="button"
                onClick={() => onNavigate(s.tab)}
                className={`group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-150 ${hoverCls} hover:shadow-md`}
                data-testid={`overview-shortcut-${s.tab}-btn`}
              >
                <WorkspaceTabIcon tab={s.tab} active={false} />
                <p className="mt-3 text-sm font-semibold text-slate-900">{s.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">{s.body}</p>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

type GeneratePlanOptions = { testCaseTypes?: string[] };

const TEST_CASE_TYPE_OPTIONS: Array<{ value: string; label: string; description: string }> = [
  { value: "smoke", label: "Smoke", description: "Critical P0 sanity checks" },
  { value: "functional", label: "Functional", description: "Happy path & core flows" },
  { value: "negative", label: "Negative", description: "Invalid inputs & error paths" },
  { value: "edgecase", label: "Edge cases", description: "Boundaries & limits" },
  { value: "e2e", label: "E2E", description: "Full user journeys" },
];

const ALL_TYPE_VALUES = TEST_CASE_TYPE_OPTIONS.map((o) => o.value);


export function RequirementsWorkspacePanel({
  project,
  projectId,
  busy,
  onGeneratePlan,
  onCreatePlan,
  onUpdateRequirement,
  onDeleteRequirement,
  onRefresh,
  onViewTestPlans,
  onCreateRequirement,
  requirementForm,
}: {
  project: ProjectPanelsData;
  projectId: string;
  busy: string | null;
  onGeneratePlan: (requirementId: string, options?: GeneratePlanOptions) => Promise<void>;
  onCreatePlan: (requirementId: string, suiteName: string) => Promise<void>;
  onUpdateRequirement: (requirementId: string, title: string, content: string) => Promise<void>;
  onDeleteRequirement: (requirementId: string, title: string | null, planCount: number) => Promise<void>;
  onRefresh: () => void;
  onViewTestPlans: () => void;
  onCreateRequirement?: (title: string, content: string) => Promise<void>;
  requirementForm: ReactNode;
}) {
  const [showForm, setShowForm] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitialId, setEditorInitialId] = useState<string | null>(null);
  const totalPlans = project.requirements.reduce((n, r) => n + r.testPlans.length, 0);

  function openEditor(id?: string) {
    setEditorInitialId(id ?? project.requirements[0]?.id ?? null);
    setEditorOpen(true);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-sky-100 text-sky-700">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <path strokeLinecap="round" d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
                <path strokeLinecap="round" d="M9 12h6M9 16h4" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-900">Requirements</h2>
              <p className="text-xs text-slate-500">
                {project.requirements.length} requirement{project.requirements.length !== 1 ? "s" : ""} ·{" "}
                <button type="button" onClick={onViewTestPlans} className="text-green-700 hover:underline">
                  {totalPlans} test plan{totalPlans !== 1 ? "s" : ""}
                </button>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              title="Refresh"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            {project.requirements.length > 0 && (
            <button
              type="button"
              onClick={() => openEditor()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Open Editor
            </button>
          )}
          {onCreateRequirement !== undefined && (
              <button
                type="button"
                onClick={() => setShowForm((v) => !v)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                  showForm
                    ? "border border-slate-200 bg-slate-100 text-slate-700"
                    : "border border-green-300 bg-accent text-slate-900 hover:bg-accent-dim"
                }`}
              >
                {showForm ? (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel
                  </>
                ) : (
                  <>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                    </svg>
                    New Requirement
                  </>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Inline new requirement form */}
        {showForm && (
          <div className="border-b border-slate-100 px-5 py-4 bg-slate-50">
            <p className="mb-3 text-xs font-semibold text-slate-600">New Requirement — paste PRD snippets, acceptance criteria, or user stories</p>
            {requirementForm}
          </div>
        )}

      </div>

      {/* Jira import */}
      {onCreateRequirement !== undefined && (
        <JiraImportSection projectId={projectId} onCreateRequirement={onCreateRequirement} onRefresh={onRefresh} />
      )}

      {/* Requirements list */}
      {project.requirements.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl border border-slate-200 bg-white py-12 text-center shadow-sm">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-2xl">📋</div>
          <p className="mt-3 text-sm font-medium text-slate-700">No requirements yet</p>
          <p className="mt-1 text-xs text-slate-500">Click "New Requirement" to add your first one.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {project.requirements.map((req) => (
            <SavedRequirementCard
              key={req.id}
              requirement={req}
              busy={busy}
              onGeneratePlan={onGeneratePlan}
              onCreatePlan={onCreatePlan}
              onUpdateRequirement={onUpdateRequirement}
              onDeleteRequirement={onDeleteRequirement}
              onOpenEditor={() => openEditor(req.id)}
            />
          ))}
        </div>
      )}

      {/* Two-panel requirement editor */}
      <RequirementEditor
        requirements={project.requirements}
        initialRequirementId={editorInitialId}
        busy={busy}
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        onUpdateRequirement={onUpdateRequirement}
        onDeleteRequirement={onDeleteRequirement}
        onGeneratePlan={onGeneratePlan}
        onCreatePlan={onCreatePlan}
      />
    </div>
  );
}

// ── Jira import ─────────────────────────────────────────────────────────────

type JiraStory = {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  status: string;
};

function JiraImportSection({
  projectId,
  onCreateRequirement,
  onRefresh,
}: {
  projectId: string;
  onCreateRequirement: (title: string, content: string) => Promise<void>;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [jql, setJql] = useState("");
  const [instructions, setInstructions] = useState("");
  const [stories, setStories] = useState<JiraStory[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fetching, setFetching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [defaultJqlLoaded, setDefaultJqlLoaded] = useState(false);

  useEffect(() => {
    if (!expanded || defaultJqlLoaded) return;
    setDefaultJqlLoaded(true);
    fetch(`/api/projects/${projectId}/jira-config`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { jira?: { defaultJql?: string | null } } | null) => {
        const saved = body?.jira?.defaultJql ?? "";
        if (saved) setJql(saved);
      })
      .catch(() => { });
  }, [expanded, projectId, defaultJqlLoaded]);

  const onFetch = useCallback(async () => {
    if (!jql.trim()) {
      toast.error("Enter a JQL query");
      return;
    }
    setFetching(true);
    setStories([]);
    setSelected(new Set());
    try {
      const res = await fetch(`/api/projects/${projectId}/jira-config/fetch-stories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jql: jql.trim(), maxResults: 50 }),
      });
      const body = (await res.json()) as { stories?: JiraStory[]; error?: string };
      if (!res.ok) {
        toast.error(body.error ?? "Could not fetch stories");
        return;
      }
      const fetched = body.stories ?? [];
      setStories(fetched);
      if (fetched.length === 0) toast.success("No stories matched the JQL query");
    } finally {
      setFetching(false);
    }
  }, [jql, projectId, toast]);

  const onImport = useCallback(async () => {
    if (selected.size === 0) {
      toast.error("Select at least one story to import");
      return;
    }
    setImporting(true);
    const prefix = instructions.trim().length > 0 ? `${instructions.trim()}\n\n` : "";
    let created = 0;
    try {
      for (const story of stories) {
        if (!selected.has(story.key)) continue;
        const title = `[${story.key}] ${story.summary}`;
        const content = `${prefix}[${story.key}] ${story.summary}\n\n${story.description}`.trim();
        await onCreateRequirement(title, content);
        created++;
      }
      if (created > 0) {
        toast.success(`Imported ${created} requirement${created === 1 ? "" : "s"} from Jira`);
        setSelected(new Set());
        setStories([]);
        onRefresh();
      }
    } finally {
      setImporting(false);
    }
  }, [selected, stories, instructions, onCreateRequirement, onRefresh, toast]);

  function toggleStory(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(stories.map((s) => s.key)) : new Set());
  }

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
        data-testid="jira-import-toggle-btn"
      >
        <span className="flex items-center gap-2">
          <JiraIcon />
          <span className="text-sm font-semibold text-slate-900">Import from Jira</span>
        </span>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div className="border-t border-slate-200 px-5 py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
            <label className="block text-xs text-slate-500">
              JQL query
              <input
                value={jql}
                onChange={(e) => setJql(e.target.value)}
                placeholder='project = MYPROJ AND issuetype = Story AND status != Done ORDER BY created DESC'
                maxLength={500}
                disabled={fetching}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onFetch(); } }}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900 disabled:opacity-50"
                data-testid="jira-jql-input"
              />
            </label>
            <button
              type="button"
              onClick={() => void onFetch()}
              disabled={fetching || !jql.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition whitespace-nowrap"
              data-testid="jira-fetch-stories-btn"
            >
              {fetching ? <><JiraSpinner />Fetching…</> : "Fetch Stories"}
            </button>
          </div>

          <label className="block text-xs text-slate-500">
            Instructions{" "}
            <span className="text-slate-500">(optional — prepended to each imported requirement)</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="e.g. These are mobile checkout user stories. Focus on edge cases and error handling."
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-900"
              data-testid="jira-instructions-textarea"
            />
          </label>

          {stories.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={selected.size === stories.length && stories.length > 0}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="rounded"
                  />
                  Select All ({stories.length} stories)
                </label>
                <button
                  type="button"
                  onClick={() => void onImport()}
                  disabled={importing || selected.size === 0}
                  className="ui-btn-primary ui-btn-sm disabled:opacity-50"
                  data-testid="jira-import-selected-btn"
                >
                  {importing ? <><JiraSpinner />Importing…</> : `Import selected (${selected.size})`}
                </button>
              </div>

              <ul className="max-h-80 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2">
                {stories.map((story) => (
                  <li
                    key={story.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleStory(story.key)}
                    onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") toggleStory(story.key); }}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition hover:bg-slate-50 ${selected.has(story.key)
                      ? "border-accent/30 bg-accent/5"
                      : "border-transparent"
                      }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(story.key)}
                      onChange={() => toggleStory(story.key)}
                      onClick={(e) => e.stopPropagation()}
                      className="mt-0.5 rounded"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[11px] font-semibold text-green-700">{story.key}</span>
                        <span className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                          {story.issueType}
                        </span>
                        <span className="rounded-full border border-slate-200 px-1.5 py-0.5 text-[10px] text-slate-500">
                          {story.status}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-slate-700">{story.summary}</p>
                      {story.description.length > 0 && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-500">{story.description}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

function JiraIcon() {
  return (
    <svg className="h-4 w-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M11.571 11.107 6.15 5.686a.914.914 0 0 0-1.293 0 .914.914 0 0 0 0 1.293l4.775 4.775-4.775 4.775a.914.914 0 0 0 0 1.293.914.914 0 0 0 1.293 0l5.421-5.421a.914.914 0 0 0 0-1.294zm6.857 0-5.42-5.421a.914.914 0 0 0-1.294 0 .914.914 0 0 0 0 1.293l4.775 4.775-4.775 4.775a.914.914 0 0 0 0 1.293.914.914 0 0 0 1.294 0l5.42-5.421a.914.914 0 0 0 0-1.294z" />
    </svg>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-4 w-4 text-slate-500 transition-transform ${expanded ? "rotate-180" : ""}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function JiraSpinner() {
  return (
    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />
  );
}

// ── Saved requirement card ────────────────────────────────────────────────────

function defaultSuiteNameForRequirement(requirementTitle: string | null): string {
  const title = requirementTitle?.trim();
  return title !== undefined && title.length > 0 ? title : "Test Suite";
}

function SavedRequirementCard({
  requirement,
  busy,
  onGeneratePlan,
  onCreatePlan,
  onUpdateRequirement,
  onDeleteRequirement,
  onOpenEditor,
}: {
  requirement: Requirement;
  busy: string | null;
  onGeneratePlan: (requirementId: string, options?: GeneratePlanOptions) => Promise<void>;
  onCreatePlan: (requirementId: string, suiteName: string) => Promise<void>;
  onUpdateRequirement: (requirementId: string, title: string, content: string) => Promise<void>;
  onDeleteRequirement: (requirementId: string, title: string | null, planCount: number) => Promise<void>;
  onOpenEditor?: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(requirement.title ?? "");
  const [content, setContent] = useState(requirement.content);
  const [showGenOptions, setShowGenOptions] = useState(false);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const saving = busy === `edit-req:${requirement.id}`;
  const deleting = busy === `delete-req:${requirement.id}`;
  const generating = busy === `plan:${requirement.id}`;

  function toggleType(value: string) {
    setSelectedTypes((prev) =>
      prev.includes(value) ? prev.filter((t) => t !== value) : [...prev, value],
    );
  }

  async function submitGenerate() {
    if (selectedTypes.length === 0) {
      toast.error("Select at least one test case type");
      return;
    }
    setShowGenOptions(false);
    await onGeneratePlan(requirement.id, {
      testCaseTypes: selectedTypes,
    });
  }

  function startEdit() {
    setTitle(requirement.title ?? "");
    setContent(requirement.content);
    setEditing(true);
  }

  function cancelEdit() {
    setTitle(requirement.title ?? "");
    setContent(requirement.content);
    setEditing(false);
  }

  async function saveEdit() {
    if (content.trim().length === 0) {
      toast.error("Requirement text cannot be empty");
      return;
    }
    try {
      await onUpdateRequirement(requirement.id, title, content);
      setEditing(false);
    } catch {
      // parent shows toast
    }
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{requirement.title ?? "Untitled requirement"}</h3>
          <p className="text-xs text-slate-500">{new Date(requirement.createdAt).toLocaleString()}</p>
          {requirement.testPlans.length > 0 ? (
            <p className="mt-1 text-xs text-slate-500">
              {requirement.testPlans.length} test plan{requirement.testPlans.length === 1 ? "" : "s"} in library
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {onOpenEditor !== undefined && !editing ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={onOpenEditor}
              className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50"
            >
              Open Editor
            </button>
          ) : null}
          {!editing ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={startEdit}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`requirement-edit-btn-${requirement.id}`}
            >
              Edit
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== null || editing}
            onClick={() => void onCreatePlan(requirement.id, defaultSuiteNameForRequirement(requirement.title))}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid={`requirement-create-plan-btn-${requirement.id}`}
          >
            {busy === `create-plan:${requirement.id}` ? "Creating…" : "Create test plan"}
          </button>
          {generating ? (
            <button type="button" disabled className="ui-btn-primary ui-btn-xs opacity-50 cursor-not-allowed inline-flex items-center gap-1.5">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />
              Generating…
            </button>
          ) : (
            <button
              type="button"
              disabled={busy !== null || editing}
              onClick={() => setShowGenOptions((v) => !v)}
              className="ui-btn-primary ui-btn-xs disabled:cursor-not-allowed disabled:opacity-50"
              data-testid={`requirement-generate-plan-btn-${requirement.id}`}
            >
              {showGenOptions ? "Cancel" : "Generate test plan"}
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null || editing || deleting}
            onClick={() =>
              void onDeleteRequirement(
                requirement.id,
                requirement.title,
                requirement.testPlans.length,
              )
            }
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid={`requirement-delete-btn-${requirement.id}`}
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </header>

      {generating ? (
        <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-500" />
            <div>
              <p className="text-sm font-semibold text-sky-800">Test Plan Generation using AI — in progress</p>
              <p className="mt-1 text-xs text-slate-500">
                Analyzing your requirement and creating structured test cases. This may take up to a minute.
              </p>
            </div>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-sky-50">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-sky-500/50" />
          </div>
        </div>
      ) : null}

      {showGenOptions && !generating ? (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-4 space-y-4">
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-sky-800">Select test case types to generate</p>
              <button
                type="button"
                onClick={() =>
                  setSelectedTypes(
                    selectedTypes.length === ALL_TYPE_VALUES.length ? [] : [...ALL_TYPE_VALUES],
                  )
                }
                className="text-[11px] text-slate-500 hover:text-slate-700"
              >
                {selectedTypes.length === ALL_TYPE_VALUES.length ? "Clear All" : "Select All"}
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {TEST_CASE_TYPE_OPTIONS.map((opt) => {
                const checked = selectedTypes.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className={`flex cursor-pointer flex-col gap-2 rounded-lg border p-3 text-xs transition ${checked
                      ? "border-sky-200 bg-sky-50 text-sky-800"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-200"
                      }`}
                  >
                    <span className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleType(opt.value)}
                        className="h-4 w-4 rounded border-slate-200 bg-white text-sky-400 accent-sky-400"
                      />
                      <span className="font-semibold">{opt.label}</span>
                    </span>
                    <span className="text-[10px] leading-snug text-slate-500">{opt.description}</span>
                  </label>
                );
              })}
            </div>
          </div>
          <div className="flex items-center gap-3 pt-1">
            <button
              type="button"
              disabled={selectedTypes.length === 0}
              onClick={() => void submitGenerate()}
              className="ui-btn-primary ui-btn-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              Generate
            </button>
            <button
              type="button"
              onClick={() => setShowGenOptions(false)}
              className="text-xs text-slate-500 hover:text-slate-900"
            >
              Cancel
            </button>
            {selectedTypes.length === 0 ? (
              <span className="text-xs text-rose-600">Select at least one type above</span>
            ) : (
              <span className="text-xs text-slate-500">
                {selectedTypes.length} type{selectedTypes.length === 1 ? "" : "s"} selected
              </span>
            )}
          </div>
        </div>
      ) : null}

      {editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
          data-testid={`requirement-edit-form-${requirement.id}`}
        >
          <label className="block text-xs font-medium text-slate-500">
            Title (optional)
            <input
              value={title}
              disabled={saving}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-green-400/20 focus:ring-2"
              data-testid="requirement-title-input"
            />
          </label>
          <label className="block text-xs font-medium text-slate-500">
            Requirement text
            <textarea
              value={content}
              disabled={saving}
              onChange={(e) => setContent(e.target.value)}
              required
              minLength={1}
              maxLength={48_000}
              rows={10}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-green-400/20 focus:ring-2"
              data-testid="requirement-content-textarea"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="ui-btn-primary ui-btn-sm" data-testid="requirement-save-btn">
              {saving ? "Saving…" : "Save Changes"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={cancelEdit}
              className="ui-btn-secondary ui-btn-sm"
              data-testid="requirement-cancel-btn"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-600">
          {requirement.content}
        </pre>
      )}
    </article>
  );
}
