"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  labelForTestStepActionForPlatform,
  testPlanSchema,
  type ProjectPlatformType,
  type TestCase,
  type TestPlan,
} from "@jagadeeshqtsolv/core";
import { testRunnerDisplayName } from "@/lib/test-framework";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";
import {
  draftFromTestCase,
  newTestCaseDraft,
  TestCaseEditForm,
  type PageObjectOption,
} from "./test-case-edit-form";

type GeneratedCode = {
  typescript: string;
  environment: { slug: string } | null;
};

type TestPlanRow = {
  id: string;
  createdAt: string;
  model: string;
  json: string;
  generatedCodes: GeneratedCode[];
};

type Requirement = {
  id: string;
  title: string | null;
  testPlans: TestPlanRow[];
};

type FlatTestPlan = TestPlanRow & {
  requirementId: string;
  requirementTitle: string | null;
};

type ParsedPlan = {
  plan: FlatTestPlan;
  data: TestPlan;
};

type RequirementFolder = {
  requirementId: string;
  folderName: string;
  suites: ParsedPlan[];
};

function parsePlanJson(json: string): TestPlan | null {
  try {
    const parsed: unknown = JSON.parse(json) as unknown;
    const result = testPlanSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

function groupByRequirement(requirements: Requirement[]): RequirementFolder[] {
  const folders: RequirementFolder[] = [];

  for (const req of requirements) {
    const suites: ParsedPlan[] = [];
    for (const plan of req.testPlans) {
      const data = parsePlanJson(plan.json);
      if (data !== null) {
        suites.push({
          plan: {
            ...plan,
            requirementId: req.id,
            requirementTitle: req.title,
          },
          data,
        });
      }
    }
    if (suites.length === 0) continue;

    suites.sort((a, b) => new Date(b.plan.createdAt).getTime() - new Date(a.plan.createdAt).getTime());

    folders.push({
      requirementId: req.id,
      folderName: req.title?.trim() || "Untitled requirement",
      suites,
    });
  }

  return folders;
}

function requirementSpecPath(folderName: string): string {
  const slug = folderName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `tests/${slug.length > 0 ? slug : "requirement"}.spec.ts`;
}

function priorityClass(priority: TestCase["priority"]): string {
  if (priority === "P0") return "bg-rose-100 text-rose-700";
  if (priority === "P1") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

const CATEGORY_TAG_LABELS: Record<string, string> = {
  smoke: "Smoke",
  functional: "Functional",
  negative: "Negative",
  edgecase: "Edge Case",
  e2e: "E2E",
};

const CATEGORY_TAG_CLASSES: Record<string, string> = {
  smoke:      "bg-orange-100 text-orange-700",
  functional: "bg-sky-100 text-sky-700",
  negative:   "bg-rose-100 text-rose-600",
  edgecase:   "bg-violet-100 text-violet-700",
  e2e:        "bg-emerald-100 text-emerald-700",
};

function extractCategoryTag(tags: string[]): { label: string; cls: string } | null {
  for (const tag of tags) {
    const key = tag.trim().toLowerCase().replace(/^@/, "");
    if (key in CATEGORY_TAG_LABELS) {
      return { label: CATEGORY_TAG_LABELS[key]!, cls: CATEGORY_TAG_CLASSES[key] ?? "bg-slate-100 text-slate-600" };
    }
  }
  return null;
}

function codegenBusyKey(planId: string, testCaseId?: string): string {
  return testCaseId !== undefined ? `code:${planId}:${testCaseId}` : `code:${planId}`;
}

function editCaseBusyKey(planId: string, testCaseId: string): string {
  return `edit-case:${planId}:${testCaseId}`;
}

function addCaseBusyKey(planId: string): string {
  return `add-case:${planId}`;
}

const CREATE_PLAN_BUSY = "create-plan";

type CreatePlanRequirementMode = "new" | "existing";

function defaultSuiteName(requirementTitle: string | null): string {
  const title = requirementTitle?.trim();
  return title !== undefined && title.length > 0 ? title : "Test Suite";
}

function TestCaseCard({
  testCase,
  planId,
  projectId,
  platformType,
  pageObjects,
  busy,
  onGenerate,
  onDelete,
  onSave,
  hideEdit = false,
}: {
  testCase: TestCase;
  planId: string;
  projectId: string;
  platformType: ProjectPlatformType;
  pageObjects: PageObjectOption[];
  busy: string | null;
  onGenerate: (testPlanId: string, testCaseId: string) => void;
  onDelete: (testPlanId: string, testCaseId: string, title: string) => Promise<void>;
  onSave: (testPlanId: string, testCase: TestCase) => Promise<void>;
  hideEdit?: boolean;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<TestCase>(() => draftFromTestCase(testCase));
  const generating = busy === codegenBusyKey(planId, testCase.id);
  const saving = busy === editCaseBusyKey(planId, testCase.id);

  function startEdit() {
    setDraft(draftFromTestCase(testCase));
    setEditing(true);
    setOpen(true);
  }

  function cancelEdit() {
    setDraft(draftFromTestCase(testCase));
    setEditing(false);
  }

  async function saveEdit(saved: TestCase) {
    await onSave(planId, saved);
    setEditing(false);
  }

  return (
    <li className="rounded-lg border border-slate-200 bg-white shadow-xs">
      {/* Card header row */}
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={editing}
          className="flex min-w-0 flex-1 items-center gap-3 text-left disabled:opacity-60"
        >
          <svg
            className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
          </svg>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${priorityClass(testCase.priority)}`}>
                {testCase.priority}
              </span>
              {(() => {
                const cat = extractCategoryTag(testCase.tags);
                return cat ? (
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${cat.cls}`}>{cat.label}</span>
                ) : null;
              })()}
              {testCase.platforms.length > 0 && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">{testCase.platforms.join(", ")}</span>
              )}
            </span>
            <span className="mt-0.5 block text-sm font-semibold text-slate-900">{testCase.title}</span>
          </span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">
            {testCase.preconditions.length > 0 ? `${testCase.preconditions.length}pre + ` : ""}{testCase.steps.length} steps
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          {!hideEdit && !editing ? (
            <button type="button" disabled={busy !== null} onClick={startEdit}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              Edit
            </button>
          ) : null}
          <button type="button" disabled={busy !== null || editing} onClick={() => void onGenerate(planId, testCase.id)}
            className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-700 hover:bg-sky-100 disabled:opacity-50">
            {generating ? "Generating…" : "Generate"}
          </button>
          <button type="button" disabled={busy !== null || editing} onClick={() => void onDelete(planId, testCase.id, testCase.title)}
            className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50">
            Delete
          </button>
        </div>
      </div>

      {open && editing ? (
        <TestCaseEditForm draft={draft} disabled={saving} projectId={projectId} platformType={platformType}
          pageObjects={pageObjects} onChange={setDraft}
          onSubmit={(saved) => void saveEdit(saved)} onCancel={cancelEdit} />
      ) : null}

      {open && !editing ? (
        <div className="border-t border-slate-100 bg-slate-50 px-4 pb-4 pt-3">
          {/* Tags */}
          {testCase.tags.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-1">
              {testCase.tags.map((tag) => (
                <span key={tag} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-500">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {/* Steps */}
          <div className="space-y-1.5">
            {/* Preconditions */}
            {testCase.preconditions.map((p, i) => (
              <div key={`pre-${i}`} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-10 shrink-0 items-center justify-center rounded-md bg-amber-100 text-[9px] font-bold uppercase text-amber-700">
                  Pre {i + 1}
                </span>
                <div className="flex-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-[11px] font-semibold text-amber-800">Precondition: </span>
                  <span className="text-[11px] text-slate-700">{p}</span>
                </div>
              </div>
            ))}

            {/* Steps */}
            {testCase.steps.map((step, i) => (
              <div key={step.id} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-10 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[9px] font-bold text-slate-600">
                  {i + 1}
                </span>
                <div className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-[12px]">
                    <span className="font-semibold text-sky-700">
                      {labelForTestStepActionForPlatform(step.action, platformType)}
                    </span>
                    <span className="text-slate-700">{step.targetDescription}</span>
                    {step.screenName && (
                      <span className="rounded bg-sky-50 px-1 py-0.5 font-mono text-[10px] text-sky-700">[{step.screenName}]</span>
                    )}
                    {step.pageObjectMethod && (
                      <span className="rounded bg-emerald-50 px-1 py-0.5 font-mono text-[10px] text-emerald-700">.{step.pageObjectMethod}()</span>
                    )}
                    {step.locatorHint && (
                      <span className="text-[11px] text-slate-400">({step.locatorHint})</span>
                    )}
                    {step.value && (
                      <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">→ &quot;{step.value}&quot;</span>
                    )}
                    {step.assertion && (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">✓ {step.assertion}</span>
                    )}
                  </div>
                  {step.customCode && (
                    <pre className="mt-1.5 overflow-x-auto rounded-md border border-slate-100 bg-slate-50 p-2 font-mono text-[10px] leading-relaxed text-emerald-700">
                      {step.customCode}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </li>
  );
}


export function TestPlansSection({
  projectId,
  platformType = "mobile",
  requirements,
  environments,
  pageObjects,
  busy,
  selectedEnvId,
  onSelectedEnvIdChange,
  onGenerateCode,
  onRefresh,
  onBusyChange,
}: {
  projectId: string;
  platformType?: ProjectPlatformType;
  requirements: Requirement[];
  environments: Array<{ id: string; name: string; slug: string }>;
  pageObjects: PageObjectOption[];
  busy: string | null;
  selectedEnvId: string;
  onSelectedEnvIdChange: (id: string) => void;
  onGenerateCode: (testPlanId: string, testCaseId?: string) => Promise<void>;
  onRefresh: () => void;
  onBusyChange: (key: string | null) => void;
}) {
  const toast = useToast();
  const folders = groupByRequirement(requirements);
  const [showCreatePlan, setShowCreatePlan] = useState(false);
  const [createPlanMode, setCreatePlanMode] = useState<CreatePlanRequirementMode>("new");
  const [createRequirementId, setCreateRequirementId] = useState("");
  const [createSuiteName, setCreateSuiteName] = useState("");
  const [newRequirementTitle, setNewRequirementTitle] = useState("");
  const [newRequirementContent, setNewRequirementContent] = useState("");

  const creatingPlan = busy === CREATE_PLAN_BUSY;
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorInitialPlanId, setEditorInitialPlanId] = useState<string | null>(null);

  function openEditor(planId?: string) {
    setEditorInitialPlanId(planId ?? folders[0]?.suites[0]?.plan.id ?? null);
    setEditorOpen(true);
  }

  function openCreatePlanForm() {
    const first = requirements[0];
    if (first !== undefined) {
      setCreatePlanMode("existing");
      setCreateRequirementId(first.id);
      setCreateSuiteName(defaultSuiteName(first.title));
    } else {
      setCreatePlanMode("new");
      setCreateRequirementId("");
      setCreateSuiteName("Test Suite");
    }
    setNewRequirementTitle("");
    setNewRequirementContent("");
    setShowCreatePlan(true);
  }

  function closeCreatePlanForm() {
    setShowCreatePlan(false);
    setCreatePlanMode("new");
    setCreateRequirementId("");
    setCreateSuiteName("");
    setNewRequirementTitle("");
    setNewRequirementContent("");
  }

  function onCreatePlanModeChange(mode: CreatePlanRequirementMode) {
    setCreatePlanMode(mode);
    if (mode === "existing") {
      const first = requirements[0];
      if (first !== undefined) {
        setCreateRequirementId(first.id);
        setCreateSuiteName(defaultSuiteName(first.title));
      }
    } else if (newRequirementTitle.trim().length > 0) {
      setCreateSuiteName(defaultSuiteName(newRequirementTitle));
    }
  }

  function onCreateRequirementChange(requirementId: string) {
    setCreateRequirementId(requirementId);
    const req = requirements.find((r) => r.id === requirementId);
    if (req !== undefined) {
      setCreateSuiteName(defaultSuiteName(req.title));
    }
  }

  function onNewRequirementTitleChange(title: string) {
    setNewRequirementTitle(title);
    if (createPlanMode === "new") {
      const trimmed = title.trim();
      if (trimmed.length > 0) {
        setCreateSuiteName(defaultSuiteName(trimmed));
      }
    }
  }

  async function submitCreatePlan(e: FormEvent) {
    e.preventDefault();
    const suiteName = createSuiteName.trim();
    if (suiteName.length === 0) {
      toast.error("Suite name is required");
      return;
    }

    const payload: {
      suiteName: string;
      requirementId?: string;
      requirementTitle?: string;
      requirementContent?: string;
    } = { suiteName };

    if (createPlanMode === "existing") {
      if (createRequirementId.length === 0) {
        toast.error("Select a requirement");
        return;
      }
      payload.requirementId = createRequirementId;
    } else {
      const title = newRequirementTitle.trim();
      const content = newRequirementContent.trim();
      if (title.length > 0) {
        payload.requirementTitle = title;
      }
      if (content.length > 0) {
        payload.requirementContent = content;
      }
    }

    onBusyChange(CREATE_PLAN_BUSY);
    try {
      const res = await fetch(`/api/projects/${projectId}/test-plans`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not create test plan"));
        return;
      }
      toast.success(
        createPlanMode === "new" ? "Test plan and requirement created" : "Test plan created",
      );
      closeCreatePlanForm();
      onRefresh();
    } finally {
      onBusyChange(null);
    }
  }

  async function deleteTestPlan(testPlanId: string, suiteName: string) {
    const confirmed = window.confirm(`Delete test plan "${suiteName}" and all of its test cases?`);
    if (!confirmed) return;
    onBusyChange(`delete-plan:${testPlanId}`);
    try {
      const res = await fetch(`/api/projects/${projectId}/test-plans/${testPlanId}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not delete test plan"));
        return;
      }
      toast.success("Test plan deleted");
      onRefresh();
    } finally {
      onBusyChange(null);
    }
  }

  async function deleteTestCase(testPlanId: string, testCaseId: string, title: string) {
    const confirmed = window.confirm(`Delete test case "${title}"?`);
    if (!confirmed) return;
    onBusyChange(`delete-case:${testPlanId}:${testCaseId}`);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/test-plans/${testPlanId}/cases/${encodeURIComponent(testCaseId)}`,
        { method: "DELETE" },
      );
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not delete test case"));
        return;
      }
      toast.success("Test case deleted");
      onRefresh();
    } finally {
      onBusyChange(null);
    }
  }
  async function updateTestCase(testPlanId: string, testCase: TestCase) {
    onBusyChange(editCaseBusyKey(testPlanId, testCase.id));
    try {
      const res = await fetch(
        `/api/projects/${projectId}/test-plans/${testPlanId}/cases/${encodeURIComponent(testCase.id)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ testCase }),
        },
      );
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not save test case"));
        return;
      }
      const saved = (await res.json()) as { stepCodegen?: { testBlock: string } };
      toast.success(
        saved.stepCodegen?.testBlock
          ? `Test case saved and ${runnerLabel} spec updated`
          : "Test case saved",
      );
      onRefresh();
    } finally {
      onBusyChange(null);
    }
  }

  async function createTestCase(testPlanId: string, testCase: TestCase) {
    onBusyChange(addCaseBusyKey(testPlanId));
    try {
      const res = await fetch(`/api/projects/${projectId}/test-plans/${testPlanId}/cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCase }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not add test case"));
        return;
      }
      const created = (await res.json()) as { stepCodegen?: { testBlock: string } };
      toast.success(
        created.stepCodegen?.testBlock
          ? `Test case added and ${runnerLabel} spec updated`
          : "Test case added",
      );
      onRefresh();
    } finally {
      onBusyChange(null);
    }
  }

  const totalCases = folders.reduce(
    (n, f) => n + f.suites.reduce((sn, s) => sn + s.data.cases.length, 0),
    0,
  );
  const runnerLabel = testRunnerDisplayName(platformType);

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green-100 text-green-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7L8 5z" fill="currentColor" fillOpacity="0.15" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7L8 5z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-900">{runnerLabel} code generation</p>
              <p className="text-xs text-slate-500">
                Specs written to <code className="font-mono text-slate-600">frameworks/tests/</code>
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <span className="shrink-0 font-medium text-slate-500">Environment</span>
              <select
                value={selectedEnvId}
                onChange={(e) => onSelectedEnvIdChange(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-xs"
              >
                <option value="">(none)</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>{e.name} ({e.slug})</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Test plan library</h2>
            <p className="mt-1 text-sm text-slate-500">
              {totalCases} test case{totalCases === 1 ? "" : "s"} across {folders.length} requirement
              {folders.length === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {folders.length > 0 && (
              <a
                href={`/api/projects/${projectId}/test-plans/export`}
                download
                className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-100"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export Excel
              </a>
            )}
            {folders.length > 0 && (
              <button
                type="button"
                onClick={() => openEditor()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
                Open Editor
              </button>
            )}
            <button
              type="button"
              disabled={busy !== null}
              onClick={openCreatePlanForm}
              className="ui-btn-primary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create Test Plan
            </button>
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
          </div>
        </header>

        {showCreatePlan ? (
          <form
            onSubmit={(e) => void submitCreatePlan(e)}
            className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          >
            <p className="text-sm font-semibold text-emerald-800">New test plan</p>
            <fieldset className="text-xs font-medium text-slate-500">
              <legend className="mb-2">Requirement</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 font-normal text-slate-600">
                  <input
                    type="radio"
                    name="create-plan-requirement-mode"
                    checked={createPlanMode === "new"}
                    disabled={creatingPlan}
                    onChange={() => onCreatePlanModeChange("new")}
                  />
                  New requirement
                </label>
                <label
                  className={`flex items-center gap-2 font-normal ${requirements.length === 0 ? "text-slate-500" : "text-slate-600"}`}
                >
                  <input
                    type="radio"
                    name="create-plan-requirement-mode"
                    checked={createPlanMode === "existing"}
                    disabled={creatingPlan || requirements.length === 0}
                    onChange={() => onCreatePlanModeChange("existing")}
                  />
                  Existing requirement
                </label>
              </div>
            </fieldset>

            {createPlanMode === "new" ? (
              <div className="space-y-3">
                <label className="block text-xs font-medium text-slate-500">
                  Requirement title (optional)
                  <input
                    value={newRequirementTitle}
                    disabled={creatingPlan}
                    onChange={(e) => onNewRequirementTitleChange(e.target.value)}
                    maxLength={200}
                    placeholder="e.g. Checkout flow"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-green-400/20 focus:ring-2"
                  />
                </label>
                <label className="block text-xs font-medium text-slate-500">
                  Requirement details (optional)
                  <textarea
                    value={newRequirementContent}
                    disabled={creatingPlan}
                    onChange={(e) => setNewRequirementContent(e.target.value)}
                    rows={3}
                    placeholder="Leave empty to fill in later on the Requirements tab"
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-green-400/20 focus:ring-2"
                  />
                </label>
              </div>
            ) : (
              <label className="block text-xs font-medium text-slate-500">
                Link to requirement
                <select
                  value={createRequirementId}
                  disabled={creatingPlan}
                  onChange={(e) => onCreateRequirementChange(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  {requirements.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.title?.trim() || "Untitled requirement"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-xs font-medium text-slate-500">
              Suite name
              <input
                value={createSuiteName}
                disabled={creatingPlan}
                onChange={(e) => setCreateSuiteName(e.target.value)}
                required
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-green-400/20 focus:ring-2"
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <button type="submit" disabled={creatingPlan} className="ui-btn-primary ui-btn-sm">
                {creatingPlan ? "Creating…" : "Create"}
              </button>
              <button
                type="button"
                disabled={creatingPlan}
                onClick={closeCreatePlanForm}
                className="ui-btn-secondary ui-btn-sm"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {folders.length === 0 ? (
          <div className="flex flex-col items-center py-10 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-2xl">🗺️</div>
            <p className="mt-3 text-sm font-medium text-slate-700">No test plans yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Click <strong className="font-semibold">Create Test Plan</strong> or use <strong className="font-semibold">Generate Test Plan</strong> on the Requirements tab.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {folders.map((folder) => (
              <RequirementFolderView
                key={folder.requirementId}
                folder={folder}
                projectId={projectId}
                platformType={platformType}
                runnerLabel={runnerLabel}
                pageObjects={pageObjects}
                busy={busy}
                onGenerateCode={onGenerateCode}
                onDeletePlan={deleteTestPlan}
                onDeleteCase={deleteTestCase}
                onUpdateCase={updateTestCase}
                onCreateCase={createTestCase}
                onOpenEditor={(planId) => openEditor(planId)}
              />
            ))}
          </div>
        )}
      </section>

      <TestPlanEditor
        isOpen={editorOpen}
        onClose={() => setEditorOpen(false)}
        folders={folders}
        initialPlanId={editorInitialPlanId}
        projectId={projectId}
        platformType={platformType}
        runnerLabel={runnerLabel}
        pageObjects={pageObjects}
        busy={busy}
        onGenerateCode={onGenerateCode}
        onDeletePlan={deleteTestPlan}
        onDeleteCase={deleteTestCase}
        onUpdateCase={updateTestCase}
        onCreateCase={createTestCase}
      />
    </div>
  );
}

function RequirementFolderView({
  folder,
  projectId,
  platformType,
  runnerLabel,
  pageObjects,
  busy,
  onGenerateCode,
  onDeletePlan,
  onDeleteCase,
  onUpdateCase,
  onCreateCase,
  onOpenEditor,
}: {
  folder: RequirementFolder;
  projectId: string;
  platformType: ProjectPlatformType;
  runnerLabel: string;
  pageObjects: PageObjectOption[];
  busy: string | null;
  onGenerateCode: (testPlanId: string, testCaseId?: string) => Promise<void>;
  onDeletePlan: (testPlanId: string, suiteName: string) => Promise<void>;
  onDeleteCase: (testPlanId: string, testCaseId: string, title: string) => Promise<void>;
  onUpdateCase: (testPlanId: string, testCase: TestCase) => Promise<void>;
  onCreateCase: (testPlanId: string, testCase: TestCase) => Promise<void>;
  onOpenEditor?: (planId: string) => void;
}) {
  const caseCount = folder.suites.reduce((n, s) => n + s.data.cases.length, 0);

  return (
    <article className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5V18a1 1 0 001 1h16a1 1 0 001-1V9a1 1 0 00-1-1h-7l-2-2H4a1 1 0 00-1 1v.5z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-slate-900">{folder.folderName}</h3>
          <p className="text-[11px] text-slate-500">
            {caseCount} test case{caseCount === 1 ? "" : "s"} · <code className="font-mono">{requirementSpecPath(folder.folderName)}</code>
          </p>
        </div>
      </div>

      <div className="space-y-4 p-4">
        {folder.suites.map(({ plan, data }) => (
          <SuiteBlock
            key={plan.id}
            plan={plan}
            data={data}
            projectId={projectId}
            platformType={platformType}
            runnerLabel={runnerLabel}
            pageObjects={pageObjects}
            busy={busy}
            onGenerateCode={onGenerateCode}
            onDeletePlan={onDeletePlan}
            onDeleteCase={onDeleteCase}
            onUpdateCase={onUpdateCase}
            onCreateCase={onCreateCase}
            onOpenEditor={onOpenEditor ? () => onOpenEditor(plan.id) : undefined}
          />
        ))}
      </div>
    </article>
  );
}

function SuiteBlock({
  plan,
  data,
  projectId,
  platformType,
  runnerLabel,
  pageObjects,
  busy,
  onGenerateCode,
  onDeletePlan,
  onDeleteCase,
  onUpdateCase,
  onCreateCase,
  onOpenEditor,
}: {
  plan: FlatTestPlan;
  data: TestPlan;
  projectId: string;
  platformType: ProjectPlatformType;
  runnerLabel: string;
  pageObjects: PageObjectOption[];
  busy: string | null;
  onGenerateCode: (testPlanId: string, testCaseId?: string) => Promise<void>;
  onDeletePlan: (testPlanId: string, suiteName: string) => Promise<void>;
  onDeleteCase: (testPlanId: string, testCaseId: string, title: string) => Promise<void>;
  onUpdateCase: (testPlanId: string, testCase: TestCase) => Promise<void>;
  onCreateCase: (testPlanId: string, testCase: TestCase) => Promise<void>;
  onOpenEditor?: () => void;
}) {
  const [addingCase, setAddingCase] = useState(false);
  const [newCaseDraft, setNewCaseDraft] = useState<TestCase | null>(null);
  const codegen = plan.generatedCodes[0];
  const creating = busy === addCaseBusyKey(plan.id);
  const existingCaseIds = data.cases.map((c) => c.id);

  function startAddCase() {
    setNewCaseDraft(newTestCaseDraft(existingCaseIds, platformType));
    setAddingCase(true);
  }

  function cancelAddCase() {
    setAddingCase(false);
    setNewCaseDraft(null);
  }

  async function saveNewCase(saved: TestCase) {
    await onCreateCase(plan.id, saved);
    cancelAddCase();
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-slate-900">{data.suiteName}</p>
          <p className="text-[11px] text-slate-500">
            {new Date(plan.createdAt).toLocaleString()} · {plan.model}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {onOpenEditor !== undefined && (
            <button
              type="button"
              onClick={onOpenEditor}
              className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
            >
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Edit
            </button>
          )}
          <button
            type="button"
            disabled={busy !== null || data.cases.length === 0}
            onClick={() => void onGenerateCode(plan.id)}
            className="ui-btn-primary ui-btn-xs disabled:cursor-not-allowed inline-flex items-center gap-1.5"
            title={data.cases.length === 0 ? "Add at least one test case first" : undefined}
          >
            {busy === codegenBusyKey(plan.id) ? (
              <><span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />Generating…</>
            ) : "Generate all tests"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void onDeletePlan(plan.id, data.suiteName)}
            className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete plan
          </button>
        </div>
      </div>

      {busy === codegenBusyKey(plan.id) ? (
        <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-200 border-t-sky-500" />
            <div>
              <p className="text-sm font-semibold text-sky-800">Test Generation using AI — in progress</p>
              <p className="mt-1 text-xs text-slate-500">
                Writing {runnerLabel} specs for all test cases. This may take a moment.
              </p>
            </div>
          </div>
          <div className="mt-3 h-1 overflow-hidden rounded-full bg-sky-50">
            <div className="h-full w-2/3 animate-pulse rounded-full bg-sky-500/50" />
          </div>
        </div>
      ) : data.cases.length === 0 ? (
        <p className="mt-3 text-xs text-slate-500">No test cases yet. Add one below.</p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {data.cases.map((testCase) => (
          <TestCaseCard
            key={testCase.id}
            testCase={testCase}
            planId={plan.id}
            projectId={projectId}
            platformType={platformType}
            pageObjects={pageObjects}
            busy={busy}
            onGenerate={onGenerateCode}
            onDelete={onDeleteCase}
            onSave={onUpdateCase}
            hideEdit
          />
        ))}
      </ul>

      {addingCase && newCaseDraft !== null ? (
        <div className="mt-2 overflow-hidden rounded-lg border border-emerald-200 bg-emerald-50">
          <p className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-emerald-700">New test case</p>
          <TestCaseEditForm
            draft={newCaseDraft}
            disabled={creating}
            isNew
            existingCaseIds={existingCaseIds}
            projectId={projectId}
            platformType={platformType}
            pageObjects={pageObjects}
            onChange={setNewCaseDraft}
            onSubmit={(saved) => void saveNewCase(saved)}
            onCancel={cancelAddCase}
          />
        </div>
      ) : (
        <button
          type="button"
          disabled={busy !== null}
          onClick={startAddCase}
          className="mt-2 rounded-lg border border-dashed border-slate-200 px-3 py-2 text-xs font-semibold text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add Test Case
        </button>
      )}

      {codegen ? (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
          <svg className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-xs font-medium text-emerald-700">
            {runnerLabel} spec generated{codegen.environment ? ` (${codegen.environment.slug})` : ""} — open editor to view
          </p>
        </div>
      ) : null}
    </div>
  );
}

// ── Two-panel Test Plan Editor ───────────────────────────────────────────────

export function TestPlanEditor({
  isOpen,
  onClose,
  folders,
  initialPlanId,
  projectId,
  platformType,
  runnerLabel,
  pageObjects,
  busy,
  onGenerateCode,
  onDeletePlan,
  onDeleteCase,
  onUpdateCase,
  onCreateCase,
}: {
  isOpen: boolean;
  onClose: () => void;
  folders: RequirementFolder[];
  initialPlanId: string | null;
  projectId: string;
  platformType: ProjectPlatformType;
  runnerLabel: string;
  pageObjects: PageObjectOption[];
  busy: string | null;
  onGenerateCode: (testPlanId: string, testCaseId?: string) => Promise<void>;
  onDeletePlan: (testPlanId: string, suiteName: string) => Promise<void>;
  onDeleteCase: (testPlanId: string, testCaseId: string, title: string) => Promise<void>;
  onUpdateCase: (testPlanId: string, testCase: TestCase) => Promise<void>;
  onCreateCase: (testPlanId: string, testCase: TestCase) => Promise<void>;
}) {
  const allPlans = folders.flatMap((f) => f.suites);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(
    initialPlanId ?? allPlans[0]?.plan.id ?? null,
  );
  const [addingCase, setAddingCase] = useState(false);
  const [newCaseDraft, setNewCaseDraft] = useState<TestCase | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setSelectedPlanId(initialPlanId ?? allPlans[0]?.plan.id ?? null);
    setAddingCase(false);
    setNewCaseDraft(null);
  }, [isOpen, initialPlanId]);

  const selected = allPlans.find((s) => s.plan.id === selectedPlanId) ?? null;
  const selectedFolder = folders.find((f) => f.suites.some((s) => s.plan.id === selectedPlanId)) ?? null;
  const creating = busy === (selected ? `add-case:${selected.plan.id}` : "");

  function startAddCase() {
    if (!selected) return;
    const existingIds = selected.data.cases.map((c) => c.id);
    setNewCaseDraft(newTestCaseDraft(existingIds, platformType));
    setAddingCase(true);
  }

  async function saveNewCase(saved: TestCase) {
    if (!selected) return;
    await onCreateCase(selected.plan.id, saved);
    setAddingCase(false);
    setNewCaseDraft(null);
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm">
      <div className="flex h-full flex-col bg-white" role="dialog" aria-modal="true">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" d="M9 6h11M9 12h11M9 18h11" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 6l1.25 1.25L8.5 5M5 12l1.25 1.25L8.5 11M5 18l1.25 1.25L8.5 17" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Test Plan Editor</h2>
              <p className="text-xs text-slate-500">
                {allPlans.length} plan{allPlans.length !== 1 ? "s" : ""} across {folders.length} requirement{folders.length !== 1 ? "s" : ""}
              </p>
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

          {/* Left — plan list */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50">
            {folders.map((folder) => (
              <div key={folder.requirementId} className="mb-1">
                <div className="flex items-center gap-2 px-3 pt-3 pb-1">
                  <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-amber-100 text-amber-700">
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5V18a1 1 0 001 1h16a1 1 0 001-1V9a1 1 0 00-1-1h-7l-2-2H4a1 1 0 00-1 1v.5z" />
                    </svg>
                  </div>
                  <p className="truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{folder.folderName}</p>
                </div>
                <ul className="space-y-0.5 px-2 pb-1">
                  {folder.suites.map(({ plan, data }) => (
                    <li key={plan.id}>
                      <button
                        type="button"
                        onClick={() => { setSelectedPlanId(plan.id); setAddingCase(false); setNewCaseDraft(null); }}
                        className={`w-full rounded-lg px-3 py-2 text-left transition-all duration-150 ${
                          selectedPlanId === plan.id
                            ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200"
                            : "text-slate-600 hover:bg-white hover:text-slate-900"
                        }`}
                      >
                        <p className="truncate text-xs font-semibold">{data.suiteName}</p>
                        <div className="mt-0.5 flex items-center gap-2">
                          <span className="text-[10px] text-slate-400">{data.cases.length} case{data.cases.length !== 1 ? "s" : ""}</span>
                          {plan.generatedCodes.length > 0 && (
                            <span className="rounded bg-green-100 px-1 py-0.5 text-[9px] font-semibold text-green-700">✓ generated</span>
                          )}
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Right — plan detail */}
          <div className="flex min-w-0 flex-1 flex-col">
            {!selected ? (
              <div className="flex flex-1 items-center justify-center text-sm text-slate-400">Select a test plan</div>
            ) : (
              <>
                {/* Plan header */}
                <div className="border-b border-slate-100 bg-white px-5 py-3">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-base font-semibold text-slate-900">{selected.data.suiteName}</p>
                      <p className="mt-0.5 text-xs text-slate-400">
                        {selectedFolder?.folderName} · {new Date(selected.plan.createdAt).toLocaleString()} · {selected.plan.model}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        disabled={busy !== null || selected.data.cases.length === 0}
                        onClick={() => void onGenerateCode(selected.plan.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-accent px-3 py-1.5 text-xs font-semibold text-slate-900 hover:bg-accent-dim disabled:opacity-50"
                      >
                        {busy === codegenBusyKey(selected.plan.id) ? (
                          <><span className="h-3 w-3 animate-spin rounded-full border-2 border-current/20 border-t-current" />Generating…</>
                        ) : "Generate All Tests"}
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void onDeletePlan(selected.plan.id, selected.data.suiteName)}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-100 disabled:opacity-50"
                      >
                        Delete Plan
                      </button>
                    </div>
                  </div>
                </div>

                {/* Cases */}
                <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50 p-4">
                  {busy === codegenBusyKey(selected.plan.id) ? (
                    <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-4">
                      <div className="flex items-center gap-3">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-sky-200 border-t-sky-500" />
                        <p className="text-sm font-semibold text-sky-800">Generating {runnerLabel} specs…</p>
                      </div>
                    </div>
                  ) : null}

                  {selected.data.cases.length === 0 ? (
                    <div className="flex flex-col items-center py-12 text-center">
                      <p className="text-sm font-medium text-slate-600">No test cases yet</p>
                      <p className="mt-1 text-xs text-slate-400">Add a test case below to get started.</p>
                    </div>
                  ) : (
                    <ul className="space-y-2">
                      {selected.data.cases.map((testCase) => (
                        <TestCaseCard
                          key={testCase.id}
                          testCase={testCase}
                          planId={selected.plan.id}
                          projectId={projectId}
                          platformType={platformType}
                          pageObjects={pageObjects}
                          busy={busy}
                          onGenerate={onGenerateCode}
                          onDelete={onDeleteCase}
                          onSave={onUpdateCase}
                        />
                      ))}
                    </ul>
                  )}

                  {/* Add case */}
                  {addingCase && newCaseDraft ? (
                    <div className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-emerald-50">
                      <p className="border-b border-slate-200 px-3 py-2 text-xs font-semibold text-emerald-700">New Test Case</p>
                      <TestCaseEditForm
                        draft={newCaseDraft}
                        disabled={creating}
                        isNew
                        existingCaseIds={selected.data.cases.map((c) => c.id)}
                        projectId={projectId}
                        platformType={platformType}
                        pageObjects={pageObjects}
                        onChange={setNewCaseDraft}
                        onSubmit={(saved) => void saveNewCase(saved)}
                        onCancel={() => { setAddingCase(false); setNewCaseDraft(null); }}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={startAddCase}
                      className="mt-3 flex w-full items-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-500 hover:border-slate-400 hover:bg-white hover:text-slate-700 disabled:opacity-50"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                      </svg>
                      Add Test Case
                    </button>
                  )}
                </div>

                {/* Generated spec */}
                {selected.plan.generatedCodes[0] ? (
                  <GeneratedSpecFooter code={selected.plan.generatedCodes[0]} runnerLabel={runnerLabel} />
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GeneratedSpecFooter({ code, runnerLabel }: { code: { typescript: string; environment: { slug: string } | null }; runnerLabel: string }) {
  const [show, setShow] = useState(false);
  return (
    <div className="border-t border-slate-200 bg-white px-5 py-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => setShow((v) => !v)} className="text-xs font-semibold text-slate-500 hover:text-slate-900">
          {show ? "Hide" : "Show"} {runnerLabel} spec{code.environment ? ` (${code.environment.slug})` : ""}
        </button>
        {show && (
          <button type="button" onClick={() => void navigator.clipboard.writeText(code.typescript)} className="text-xs font-semibold text-green-700 hover:underline">
            Copy
          </button>
        )}
      </div>
      {show ? (
        <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-3 text-[11px] leading-relaxed text-slate-700">
          {code.typescript}
        </pre>
      ) : null}
    </div>
  );
}
