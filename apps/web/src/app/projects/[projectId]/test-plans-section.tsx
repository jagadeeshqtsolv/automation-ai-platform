"use client";

import { useState, type FormEvent } from "react";
import {
  labelForTestStepActionForPlatform,
  testPlanSchema,
  type ProjectPlatformType,
  type TestCase,
  type TestPlan,
} from "@automation-ai/shared";
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
  if (priority === "P0") return "bg-rose-500/20 text-rose-200";
  if (priority === "P1") return "bg-amber-500/20 text-amber-200";
  return "bg-zinc-500/20 text-zinc-300";
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
  return title !== undefined && title.length > 0 ? title : "Test suite";
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
    <li className="rounded-lg border border-white/5 bg-black/20">
      <div className="flex items-start gap-2 px-2 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          disabled={editing}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg px-1 py-1 text-left hover:bg-white/5 disabled:opacity-60"
        >
          <span className="mt-0.5 text-zinc-500">{open ? "▾" : "▸"}</span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[10px] text-zinc-500">{testCase.id}</span>
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${priorityClass(testCase.priority)}`}>
                {testCase.priority}
              </span>
              <span className="text-[10px] text-zinc-500">{testCase.platforms.join(", ")}</span>
            </span>
            <span className="mt-0.5 block text-sm font-medium text-white">{testCase.title}</span>
          </span>
          <span className="shrink-0 text-[10px] text-zinc-500">{testCase.steps.length} steps</span>
        </button>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:flex-wrap sm:justify-end">
          {!editing ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={startEdit}
              className="rounded-lg border border-white/10 bg-ink-950/60 px-2.5 py-1.5 text-[11px] font-semibold text-zinc-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== null || editing}
            onClick={() => void onGenerate(planId, testCase.id)}
            className="rounded-lg border border-sky-500/25 bg-sky-950/40 px-2.5 py-1.5 text-[11px] font-semibold text-sky-200 hover:bg-sky-900/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generating ? "Generating…" : "Generate"}
          </button>
          <button
            type="button"
            disabled={busy !== null || editing}
            onClick={() => void onDelete(planId, testCase.id, testCase.title)}
            className="rounded-lg border border-rose-500/20 bg-rose-950/30 px-2.5 py-1.5 text-[11px] font-semibold text-rose-300 hover:bg-rose-900/40 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete
          </button>
        </div>
      </div>

      {open && editing ? (
        <TestCaseEditForm
          draft={draft}
          disabled={saving}
          projectId={projectId}
          platformType={platformType}
          pageObjects={pageObjects}
          onChange={setDraft}
          onSubmit={(saved) => void saveEdit(saved)}
          onCancel={cancelEdit}
        />
      ) : null}

      {open && !editing ? (
        <div className="space-y-3 border-t border-white/5 px-3 pb-3 pt-2">
          {testCase.preconditions.length > 0 ? (
            <div className="rounded-lg border border-amber-500/15 bg-amber-950/20 px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-200/90">
                Before (preconditions)
              </p>
              <ul className="mt-1.5 space-y-1 text-xs text-zinc-300">
                {testCase.preconditions.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {testCase.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {testCase.tags.map((tag) => (
                <span key={tag} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-zinc-400">
                  {tag}
                </span>
              ))}
            </div>
          ) : null}
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200/90">Test steps</p>
            <ol className="mt-1.5 space-y-1.5">
              {testCase.steps.map((step, i) => (
                <li
                  key={step.id}
                  className="rounded-md border border-white/[0.06] bg-ink-950/40 px-2.5 py-1.5 text-xs text-zinc-300"
                >
                  <span className="font-mono text-[10px] text-zinc-500">Step {i + 1}</span>{" "}
                  <span className="font-medium text-zinc-200">
                    {labelForTestStepActionForPlatform(step.action, platformType)}
                  </span>{" "}
                  — {step.targetDescription}
                  {step.screenName ? (
                    <span className="text-sky-400/80"> [{step.screenName}]</span>
                  ) : null}
                  {step.pageObjectMethod ? (
                    <span className="text-emerald-400/80"> .{step.pageObjectMethod}()</span>
                  ) : null}
                  {step.locatorHint ? (
                    <span className="text-zinc-500"> ({step.locatorHint})</span>
                  ) : null}
                  {step.customCode ? (
                    <pre className="mt-1 overflow-x-auto rounded bg-black/40 p-1.5 font-mono text-[10px] text-emerald-200/90">
                      {step.customCode}
                    </pre>
                  ) : null}
                  {step.value ? <span className="text-zinc-500"> → &quot;{step.value}&quot;</span> : null}
                  {step.assertion ? <span className="text-emerald-400/90"> expect: {step.assertion}</span> : null}
                </li>
              ))}
            </ol>
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
  overwritePageObjectsFromTests,
  onSelectedEnvIdChange,
  onOverwritePageObjectsFromTestsChange,
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
  overwritePageObjectsFromTests: boolean;
  onSelectedEnvIdChange: (id: string) => void;
  onOverwritePageObjectsFromTestsChange: (v: boolean) => void;
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

  function openCreatePlanForm() {
    const first = requirements[0];
    if (first !== undefined) {
      setCreatePlanMode("existing");
      setCreateRequirementId(first.id);
      setCreateSuiteName(defaultSuiteName(first.title));
    } else {
      setCreatePlanMode("new");
      setCreateRequirementId("");
      setCreateSuiteName("Test suite");
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
      <section className="rounded-2xl border border-sky-500/20 bg-sky-950/15 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-sky-100">{runnerLabel} generation</h2>
            <p className="mt-1 text-xs text-zinc-400">
              Specs are written to <code className="text-zinc-300">frameworks/&lt;project-id&gt;/tests/</code> on disk.
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="text-xs text-zinc-400">
              Environment
              <select
                value={selectedEnvId}
                onChange={(e) => onSelectedEnvIdChange(e.target.value)}
                className="ml-2 rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1 text-xs text-white"
              >
                <option value="">(none)</option>
                {environments.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.slug})
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs text-zinc-300">
              <input
                type="checkbox"
                checked={overwritePageObjectsFromTests}
                onChange={(e) => onOverwritePageObjectsFromTestsChange(e.target.checked)}
              />
              Overwrite page objects already in the library (new ones are always saved)
            </label>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/40 p-6">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Test plan library</h2>
            <p className="mt-1 text-sm text-zinc-400">
              {totalCases} test case{totalCases === 1 ? "" : "s"} across {folders.length} requirement
              {folders.length === 1 ? "" : "s"}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={busy !== null}
              onClick={openCreatePlanForm}
              className="ui-btn-primary ui-btn-sm disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create test plan
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs font-semibold text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
              Refresh
            </button>
          </div>
        </header>

        {showCreatePlan ? (
          <form
            onSubmit={(e) => void submitCreatePlan(e)}
            className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-950/10 p-4"
          >
            <p className="text-sm font-semibold text-emerald-100">New test plan</p>
            <fieldset className="text-xs font-medium text-zinc-400">
              <legend className="mb-2">Requirement</legend>
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 font-normal text-zinc-300">
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
                  className={`flex items-center gap-2 font-normal ${requirements.length === 0 ? "text-zinc-600" : "text-zinc-300"}`}
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
                <label className="block text-xs font-medium text-zinc-400">
                  Requirement title (optional)
                  <input
                    value={newRequirementTitle}
                    disabled={creatingPlan}
                    onChange={(e) => onNewRequirementTitleChange(e.target.value)}
                    maxLength={200}
                    placeholder="e.g. Checkout flow"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:ring-2"
                  />
                </label>
                <label className="block text-xs font-medium text-zinc-400">
                  Requirement details (optional)
                  <textarea
                    value={newRequirementContent}
                    disabled={creatingPlan}
                    onChange={(e) => setNewRequirementContent(e.target.value)}
                    rows={3}
                    placeholder="Leave empty to fill in later on the Requirements tab"
                    className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:ring-2"
                  />
                </label>
              </div>
            ) : (
              <label className="block text-xs font-medium text-zinc-400">
                Link to requirement
                <select
                  value={createRequirementId}
                  disabled={creatingPlan}
                  onChange={(e) => onCreateRequirementChange(e.target.value)}
                  required
                  className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white"
                >
                  {requirements.map((req) => (
                    <option key={req.id} value={req.id}>
                      {req.title?.trim() || "Untitled requirement"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="block text-xs font-medium text-zinc-400">
              Suite name
              <input
                value={createSuiteName}
                disabled={creatingPlan}
                onChange={(e) => setCreateSuiteName(e.target.value)}
                required
                maxLength={200}
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:ring-2"
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
          <p className="text-sm text-zinc-500">
            No test plans yet. Click <strong className="text-zinc-400">Create test plan</strong> to start with a
            new or existing requirement, or use <strong className="text-zinc-400">Generate test plan</strong> on
            the Requirements tab.
          </p>
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
              />
            ))}
          </div>
        )}
      </section>
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
}) {
  const caseCount = folder.suites.reduce((n, s) => n + s.data.cases.length, 0);

  return (
    <article className="overflow-hidden rounded-xl border border-amber-500/15 bg-ink-950/50">
      <div className="flex items-center gap-2 border-b border-white/5 bg-amber-950/20 px-4 py-3">
        <span className="text-lg" aria-hidden>
          📁
        </span>
        
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold text-amber-100">{folder.folderName}</h3>
          <p className="text-[11px] text-zinc-500">
            {caseCount} test case{caseCount === 1 ? "" : "s"} · writes to{" "}
            <code className="font-mono text-zinc-400">{requirementSpecPath(folder.folderName)}</code>
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
}) {
  const [showCodegen, setShowCodegen] = useState(false);
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
    <div className="rounded-lg border border-white/5 bg-black/20 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-medium text-white">{data.suiteName}</p>
          <p className="text-[11px] text-zinc-500">
            {new Date(plan.createdAt).toLocaleString()} · {plan.model}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            disabled={busy !== null || data.cases.length === 0}
            onClick={() => void onGenerateCode(plan.id)}
            className="ui-btn-primary ui-btn-xs disabled:cursor-not-allowed"
            title={data.cases.length === 0 ? "Add at least one test case first" : undefined}
          >
            {busy === codegenBusyKey(plan.id)
              ? "Generating…"
              : "Generate all tests"}
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => void onDeletePlan(plan.id, data.suiteName)}
            className="rounded-lg border border-rose-500/25 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Delete plan
          </button>
        </div>
      </div>

      {data.cases.length === 0 ? (
        <p className="mt-3 text-xs text-zinc-500">No test cases yet. Add one below.</p>
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
          />
        ))}
      </ul>

      {addingCase && newCaseDraft !== null ? (
        <div className="mt-2 overflow-hidden rounded-lg border border-emerald-500/20 bg-emerald-950/10">
          <p className="border-b border-white/5 px-3 py-2 text-xs font-semibold text-emerald-200">New test case</p>
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
          className="mt-2 rounded-lg border border-dashed border-white/15 px-3 py-2 text-xs font-semibold text-zinc-400 hover:border-white/25 hover:bg-white/5 hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Add test case
        </button>
      )}

      {codegen ? (
        <div className="mt-4 border-t border-white/5 pt-3">
          <button
            type="button"
            onClick={() => setShowCodegen((v) => !v)}
            className="text-xs font-semibold text-zinc-400 hover:text-white"
          >
            {showCodegen ? "Hide" : "Show"} {runnerLabel} output
            {codegen.environment ? ` (${codegen.environment.slug})` : ""}
          </button>
          {showCodegen ? (
            <div className="mt-2 space-y-2">
              <button
                type="button"
                className="text-xs font-semibold text-accent underline-offset-4 hover:underline"
                onClick={() => void navigator.clipboard.writeText(codegen.typescript)}
              >
                Copy spec
              </button>
              <pre className="max-h-64 overflow-auto rounded-lg border border-white/5 bg-black/40 p-3 text-[11px] leading-relaxed text-zinc-200">
                {codegen.typescript}
              </pre>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-xs text-zinc-500">No {runnerLabel} spec generated for this suite yet.</p>
      )}
    </div>
  );
}
