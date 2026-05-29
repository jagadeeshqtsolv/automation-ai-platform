"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BrowserRecorderPanel } from "./browser-recorder";
import { DeviceRecorderPanel } from "./device-recorder";
import { GeneratePomSection } from "./generate-pom-section";
import { ProjectWorkspaceNav, type WorkspaceTab } from "./project-workspace-nav";
import { buildWorkspaceNavItems } from "./workspace-nav-config";
import { TestPlansSection } from "./test-plans-section";
import { countTestCasesInPlanJson } from "@/lib/count-test-cases";
import { DEFAULT_ENVIRONMENT_CONFIG_JSON } from "@/lib/mobilewright-environment-config";
import { projectPlatformLabel, type ProjectPlatformType } from "@jagadeeshqtsolv/core";
import {
  codegenApiPath,
  defaultEnvironmentConfigJson,
  testConfigFileName,
  testRunnerDisplayName,
} from "@/lib/test-framework";
import { ProjectAISettings } from "./project-ai-settings";
import { ProjectExecutionSettings } from "./project-execution-settings";
import { ProjectGitSettings } from "./project-git-settings";
import { ProjectJiraSettings } from "./project-jira-settings";
import { GitStatusWidget } from "./git-status-widget";
import { TestExecutionPanel } from "./test-execution-panel";
import { TestReportsPanel } from "./test-reports-panel";
import { ProjectChatPanel } from "./project-chat-panel";
import { RequirementsWorkspacePanel, WorkspaceOverviewPanel } from "./workspace-panels";
import { useToast } from "@/components/toast-provider";
import { readApiError } from "@/lib/api-response";

type GeneratedCode = {
  id: string;
  createdAt: string;
  model: string;
  typescript: string;
  environmentId: string | null;
  environment: { id: string; name: string; slug: string } | null;
};

type TestPlan = {
  id: string;
  createdAt: string;
  model: string;
  json: string;
  generatedCodes: GeneratedCode[];
};

type Requirement = {
  id: string;
  title: string | null;
  content: string;
  createdAt: string;
  testPlans: TestPlan[];
};

type EnvironmentRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  configJson: string;
  createdAt: string;
  updatedAt: string;
};

type PageObjectRow = {
  id: string;
  className: string;
  modulePath: string;
  screenName: string | null;
  methodSummary: string;
  createdAt: string;
  updatedAt: string;
};

type ProjectDetail = {
  id: string;
  name: string;
  organizationId: string;
  platformType: ProjectPlatformType;
  createdAt: string;
  currentUserRole: "owner" | "member";
  environments: EnvironmentRow[];
  pageObjects: PageObjectRow[];
  requirements: Requirement[];
};

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const toast = useToast();
  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [selectedEnvId, setSelectedEnvId] = useState<string>("");
  const [overwritePageObjectsFromTests, setOverwritePageObjectsFromTests] = useState(false);
  const [editingPageId, setEditingPageId] = useState<string | null>(null);
  const [frameworkTick, setFrameworkTick] = useState(0);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [reportsHighlightRunId, setReportsHighlightRunId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) {
      toast.error("Could not load project");
      return;
    }
    const data = (await res.json()) as ProjectDetail;
    setProject(data);
  }, [projectId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const onCreateRequirement = useMemo(
    () => async (title: string, content: string) => {
      setBusy("saving-req");
      try {
        const res = await fetch("/api/requirements", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ projectId, title: title || undefined, content }),
        });
        if (!res.ok) {
          toast.error(await readApiError(res, "Could not save requirement"));
          return;
        }
        await load();
        toast.success("Requirement saved");
      } finally {
        setBusy(null);
      }
    },
    [load, projectId, toast],
  );

  const onUpdateRequirement = useMemo(
    () => async (requirementId: string, title: string, content: string) => {
      setBusy(`edit-req:${requirementId}`);
      try {
        const res = await fetch(`/api/requirements/${requirementId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim().length > 0 ? title.trim() : undefined, content }),
        });
        if (!res.ok) {
          toast.error(await readApiError(res, "Could not update requirement"));
          return;
        }
        await load();
        toast.success("Requirement updated");
      } finally {
        setBusy(null);
      }
    },
    [load, toast],
  );

  const onDeleteRequirement = useMemo(
    () => async (requirementId: string, title: string | null, planCount: number) => {
      const label = title?.trim() || "Untitled requirement";
      const planNote =
        planCount > 0
          ? ` This will also delete ${planCount} test plan${planCount === 1 ? "" : "s"} and archive related spec tests under tests/deleted/.`
          : "";
      const confirmed = window.confirm(`Delete requirement "${label}"?${planNote}`);
      if (!confirmed) {
        return;
      }
      setBusy(`delete-req:${requirementId}`);
      try {
        const res = await fetch(`/api/requirements/${requirementId}`, { method: "DELETE" });
        if (!res.ok) {
          toast.error(await readApiError(res, "Could not delete requirement"));
          return;
        }
        await load();
        setFrameworkTick((n) => n + 1);
        toast.success("Requirement deleted");
      } finally {
        setBusy(null);
      }
    },
    [load, toast],
  );

  const onGeneratePlan = useMemo(
    () =>
      async (
        requirementId: string,
        options?: { testCaseTypes?: string[] },
      ) => {
        setBusy(`plan:${requirementId}`);
        try {
          const res = await fetch("/api/generate/plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requirementId, ...options }),
          });
          if (!res.ok) {
            toast.error(await readApiError(res, "Plan generation failed"));
            return;
          }
          await load();
          toast.success("Test plan generated");
        } finally {
          setBusy(null);
        }
      },
    [load, toast],
  );

  const onCreatePlan = useMemo(
    () => async (requirementId: string, suiteName: string) => {
      setBusy(`create-plan:${requirementId}`);
      try {
        const res = await fetch(`/api/projects/${projectId}/test-plans`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requirementId, suiteName }),
        });
        if (!res.ok) {
          toast.error(await readApiError(res, "Could not create test plan"));
          return;
        }
        await load();
        toast.success("Test plan created");
      } finally {
        setBusy(null);
      }
    },
    [load, projectId, toast],
  );

  const onGenerateCode = useMemo(
    () => async (testPlanId: string, testCaseId?: string) => {
      if (project === null) {
        return;
      }
      setBusy(testCaseId !== undefined ? `code:${testPlanId}:${testCaseId}` : `code:${testPlanId}`);
      try {
        const codegenUrl = codegenApiPath(project.platformType);
        const res = await fetch(codegenUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            testPlanId,
            testCaseId,
            environmentId: selectedEnvId.length > 0 ? selectedEnvId : undefined,
            overwriteExistingPageObjects: overwritePageObjectsFromTests,
          }),
        });
        if (!res.ok) {
          toast.error(await readApiError(res, "Code generation failed"));
          return;
        }
        await load();
        setFrameworkTick((n) => n + 1);
        toast.success(testCaseId !== undefined ? "Test generated" : "All tests generated");
      } finally {
        setBusy(null);
      }
    },
    [load, project, overwritePageObjectsFromTests, selectedEnvId, toast],
  );

  if (project === null) {
    return <p className="text-sm text-zinc-400">Loading workspace…</p>;
  }

  const planCount = project.requirements.reduce((n, r) => n + r.testPlans.length, 0);
  const testCaseCount = project.requirements.reduce(
    (n, r) => n + r.testPlans.reduce((sn, plan) => sn + countTestCasesInPlanJson(plan.json), 0),
    0,
  );

  const navItems = buildWorkspaceNavItems(
    {
      requirementsCount: project.requirements.length,
      planCount,
      environmentsCount: project.environments.length,
      pageObjectsCount: project.pageObjects.length,
    },
    project.platformType,
  );

  return (
    <>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <ProjectWorkspaceNav
          items={navItems}
          active={activeTab}
          onChange={setActiveTab}
          bottomSlot={<GitStatusWidget projectId={projectId} />}
        />

        <div className="min-w-0 flex-1 space-y-4">
          {activeTab === "overview" ? (
            <WorkspaceOverviewPanel
              project={project}
              platformType={project.platformType}
              planCount={planCount}
              testCaseCount={testCaseCount}
              onNavigate={setActiveTab}
            />
          ) : null}

          {activeTab === "setup" ? (
            <ProjectSetupSection
              busy={busy}
              project={project}
              projectId={projectId}
              isOwner={project.currentUserRole === "owner"}
              onBusy={setBusy}
              onReload={async () => {
                await load();
                setFrameworkTick((n) => n + 1);
              }}
            />
          ) : null}

          {activeTab === "requirements" ? (
            <RequirementsWorkspacePanel
              project={project}
              projectId={projectId}
              busy={busy}
              onGeneratePlan={onGeneratePlan}
              onCreatePlan={onCreatePlan}
              onUpdateRequirement={onUpdateRequirement}
              onDeleteRequirement={onDeleteRequirement}
              onRefresh={() => void load()}
              onViewTestPlans={() => setActiveTab("test-plans")}
              onCreateRequirement={onCreateRequirement}
              requirementForm={
                <RequirementForm
                  disabled={busy !== null}
                  onSubmit={async (title, content) => {
                    await onCreateRequirement(title, content);
                  }}
                />
              }
            />
          ) : null}

          {activeTab === "recorder" && project.platformType === "mobile" ? (
            <DeviceRecorderPanel
              projectId={projectId}
              environments={project.environments.map((e) => ({
                id: e.id,
                name: e.name,
                slug: e.slug,
                configJson: e.configJson,
              }))}
              disabled={busy !== null}
              onSaved={async () => {
                await load();
                setFrameworkTick((n) => n + 1);
              }}
            />
          ) : null}

          {activeTab === "recorder" && project.platformType === "web" ? (
            <BrowserRecorderPanel
              projectId={projectId}
              environments={project.environments.map((e) => ({
                id: e.id,
                name: e.name,
                slug: e.slug,
                configJson: e.configJson,
              }))}
              disabled={busy !== null}
              onSaved={async () => {
                await load();
                setFrameworkTick((n) => n + 1);
              }}
            />
          ) : null}

          {activeTab === "generate-pom" ? (
            <GeneratePomSection
              projectId={projectId}
              pageObjects={project.pageObjects}
              busy={busy}
              editingPageId={editingPageId}
              onEditPage={setEditingPageId}
              onReload={load}
              onReloadProject={load}
              onFrameworkRefresh={() => setFrameworkTick((n) => n + 1)}
            />
          ) : null}

          {activeTab === "test-plans" ? (
            <TestPlansSection
              projectId={projectId}
              platformType={project.platformType}
              requirements={project.requirements}
              environments={project.environments.map((e) => ({
                id: e.id,
                name: e.name,
                slug: e.slug,
              }))}
              pageObjects={project.pageObjects.map((p) => ({
                className: p.className,
                screenName: p.screenName,
                methodSummary: p.methodSummary,
              }))}
              busy={busy}
              selectedEnvId={selectedEnvId}
              overwritePageObjectsFromTests={overwritePageObjectsFromTests}
              onSelectedEnvIdChange={setSelectedEnvId}
              onOverwritePageObjectsFromTestsChange={setOverwritePageObjectsFromTests}
              onGenerateCode={onGenerateCode}
              onRefresh={() => void load()}
              onBusyChange={setBusy}
            />
          ) : null}

          {activeTab === "test-execution" ? (
            <TestExecutionPanel
              projectId={projectId}
              platformType={project.platformType}
              environments={project.environments.map((e) => ({
                id: e.id,
                name: e.name,
                slug: e.slug,
              }))}
              disabled={busy !== null}
              onRunFinished={(runId) => {
                setReportsHighlightRunId(runId);
                setActiveTab("test-reports");
              }}
              onNavigate={setActiveTab}
            />
          ) : null}

          {activeTab === "test-reports" ? (
            <TestReportsPanel
              projectId={projectId}
              disabled={busy !== null}
              highlightRunId={reportsHighlightRunId}
              onRunFinished={(runId) => {
                setReportsHighlightRunId(runId);
              }}
              onNavigate={setActiveTab}
            />
          ) : null}

          {activeTab === "framework" ? (
            <LocalFrameworkPanel
              projectId={projectId}
              platformType={project.platformType}
              refreshKey={frameworkTick}
            />
          ) : null}
        </div>
      </div>

      <ProjectChatPanel
        projectId={projectId}
        onNavigate={setActiveTab}
        onHighlightRun={(runId) => {
          setReportsHighlightRunId(runId);
          setActiveTab("test-reports");
        }}
      />
    </>
  );
}

function LocalFrameworkPanel({
  projectId,
  platformType,
  refreshKey,
}: {
  projectId: string;
  platformType: ProjectPlatformType;
  refreshKey: number;
}) {
  const toast = useToast();
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [exists, setExists] = useState(false);
  const [files, setFiles] = useState<string[]>([]);
  const [downloading, setDownloading] = useState(false);

  const loadFramework = useCallback(async () => {
    const res = await fetch(`/api/projects/${projectId}/framework`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      rootPath?: string;
      exists?: boolean;
      entries?: Array<{ path: string; kind: string }>;
    };
    setRootPath(typeof data.rootPath === "string" ? data.rootPath : null);
    setExists(data.exists === true);
    const paths =
      Array.isArray(data.entries) ? data.entries.filter((e) => e.kind === "file").map((e) => e.path) : [];
    setFiles(paths);
  }, [projectId]);

  useEffect(() => {
    void loadFramework();
  }, [loadFramework, refreshKey]);

  const hint = `frameworks/${projectId}`;

  async function downloadFramework() {
    setDownloading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/framework/download`);
      if (!res.ok) {
        toast.error(await readApiError(res, "Download failed"));
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `framework-${projectId.slice(0, 8)}.zip`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Framework zip downloaded");
    } catch {
      toast.error("Download failed");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <section className="ui-panel-accent animate-slide-up overflow-hidden">
      <div className="ui-panel-header flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <p className="ui-eyebrow text-accent-muted">Download framework</p>
          <h2 className="ui-title">{testRunnerDisplayName(platformType)} project bundle</h2>
          <p className="ui-subtitle max-w-xl">
            Export tests, page objects, and {testConfigFileName(platformType)} as a zip. Open locally or commit to
            git, then run <code className="ui-code">npm install && npm test</code>.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button
            type="button"
            disabled={!exists || downloading}
            onClick={() => void downloadFramework()}
            className="ui-btn-success !py-2 text-xs"
          >
            {downloading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-midnight-950/20 border-t-midnight-950" />
                Preparing zip…
              </>
            ) : (
              <>
                <DownloadIcon />
                Download zip
              </>
            )}
          </button>
          <button type="button" onClick={() => void loadFramework()} className="ui-btn-secondary !py-2 text-xs">
            <RefreshIcon />
            Refresh tree
          </button>
        </div>
      </div>
      <div className="ui-panel-body space-y-4">
        <div className="rounded-xl border border-white/[0.06] bg-black/20 px-4 py-3">
          <p className="ui-eyebrow">Path on server</p>
          <p className="mt-1 font-mono text-xs text-zinc-300">{rootPath ?? hint}</p>
        </div>

        {!exists ? (
          <p className="text-sm text-zinc-500">
            No framework on disk yet. Generate page objects or {testRunnerDisplayName(platformType)} tests to
            scaffold{" "}
            <code className="ui-code">{hint}/</code>.
          </p>
        ) : (
          <>
            <div>
              <p className="mb-2 text-xs font-medium text-zinc-500">
                {files.length} file{files.length === 1 ? "" : "s"} (excludes node_modules)
              </p>
              <ul className="ui-file-tree">
                {files.length === 0 ? (
                  <li className="text-zinc-500">(empty)</li>
                ) : (
                  files.map((f) => (
                    <li key={f} className="truncate py-0.5">
                      {f}
                    </li>
                  ))
                )}
              </ul>
            </div>
            <p className="text-xs text-zinc-500">
              Local run: <code className="ui-code">cd {hint} && npm install && npm test</code>
            </p>
          </>
        )}

      </div>
    </section>
  );
}

function MemberReadOnlyNotice({ tab }: { tab: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs text-amber-200/80">
      <svg className="h-3.5 w-3.5 shrink-0 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
      </svg>
      <span>
        <span className="font-semibold text-amber-200">{tab} settings are read-only for members.</span>{" "}
        Contact an owner to make changes.
      </span>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M4 4v6h6M20 20v-6h-6M5 19a9 9 0 0114-7.5M19 5a9 9 0 00-14 7.5"
      />
    </svg>
  );
}

type SetupTab = "ai" | "execution" | "git" | "environments" | "jira";

const SETUP_TABS: { id: SetupTab; label: string }[] = [
  { id: "ai", label: "AI" },
  { id: "execution", label: "Execution" },
  { id: "git", label: "Git" },
  { id: "environments", label: "Environments" },
  { id: "jira", label: "Jira" },
];

function ProjectSetupSection(props: {
  project: ProjectDetail;
  projectId: string;
  busy: string | null;
  isOwner: boolean;
  onBusy: (v: string | null) => void;
  onReload: () => Promise<void>;
}) {
  const toast = useToast();
  const { project, projectId, busy, isOwner, onBusy, onReload } = props;
  const platform = project.platformType ?? "mobile";
  const isWeb = platform === "web";
  const runnerLabel = testRunnerDisplayName(platform);
  const configLabel = testConfigFileName(platform);
  const [setupTab, setSetupTab] = useState<SetupTab>("ai");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/ai-settings`)
      .then((r) => r.json())
      .then((body: { ai?: { activeProvider?: string | null } }) => {
        setAiConfigured(body.ai?.activeProvider != null);
      })
      .catch(() => setAiConfigured(false));
  }, [projectId]);

  const hasEnvironments = project.environments.length > 0;
  const showSetupBanner = aiConfigured === false || !hasEnvironments;

  const [envName, setEnvName] = useState("");
  const [envSlug, setEnvSlug] = useState("");
  const [envConfig, setEnvConfig] = useState(() => defaultEnvironmentConfigJson(platform));
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<string | null>(null);

  const isEditing = editingEnvironmentId !== null;

  function resetEnvironmentForm() {
    setEditingEnvironmentId(null);
    setEnvName("");
    setEnvSlug("");
    setEnvConfig(defaultEnvironmentConfigJson(platform));
  }

  function startEditEnvironment(env: EnvironmentRow) {
    setEditingEnvironmentId(env.id);
    setEnvName(env.name);
    setEnvSlug(env.slug);
    setEnvConfig(env.configJson);
  }

  async function saveEnvironment(e: FormEvent) {
    e.preventDefault();
    onBusy("env");
    try {
      const url = isEditing
        ? `/api/projects/${projectId}/environments/${editingEnvironmentId}`
        : `/api/projects/${projectId}/environments`;
      const method = isEditing ? "PATCH" : "POST";
      const body = isEditing
        ? { name: envName, configJson: envConfig }
        : { name: envName, slug: envSlug, configJson: envConfig };

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, isEditing ? "Could not update environment" : "Could not create environment"));
        return;
      }

      resetEnvironmentForm();
      await onReload();
      toast.success(isEditing ? "Environment updated" : "Environment added");
    } finally {
      onBusy(null);
    }
  }

  async function deleteEnvironment(id: string) {
    onBusy("env-del");
    try {
      const res = await fetch(`/api/projects/${projectId}/environments/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast.error("Could not delete environment");
        return;
      }
      if (editingEnvironmentId === id) {
        resetEnvironmentForm();
      }
      await onReload();
      toast.success("Environment removed");
    } finally {
      onBusy(null);
    }
  }

  return (
    <section className="rounded-2xl border border-white/10 bg-ink-900/40">
      <header className="border-b border-white/10 px-6 pt-6 pb-0">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-white">Setup</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Configure your AI provider (OpenAI or Claude), execution settings, Git integration, and test environments.
          </p>
        </div>

        {showSetupBanner && (
          <div className="mb-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
            <p className="text-sm font-medium text-amber-300">Complete setup before using this project</p>
            <ul className="mt-2 space-y-1 text-xs text-amber-200/70">
              {!aiConfigured && (
                <li>
                  <button
                    type="button"
                    onClick={() => setSetupTab("ai")}
                    className="font-semibold text-amber-200 underline-offset-2 hover:underline"
                  >
                    AI
                  </button>{" "}
                  — Add an OpenAI or Claude API key. Required for generating test plans, page objects, and test code.
                </li>
              )}
              {!hasEnvironments && (
                <li>
                  <button
                    type="button"
                    onClick={() => setSetupTab("environments")}
                    className="font-semibold text-amber-200 underline-offset-2 hover:underline"
                  >
                    Environments
                  </button>{" "}
                  — Define at least one environment (e.g. staging) with the base URL and config values used during test runs.
                </li>
              )}
            </ul>
          </div>
        )}

        <nav className="flex gap-1" aria-label="Setup sections">
          {SETUP_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSetupTab(tab.id)}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${setupTab === tab.id
                  ? "border border-b-0 border-white/10 bg-ink-950/60 text-white"
                  : "text-zinc-400 hover:text-zinc-200"
                }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </header>

      <div className="p-6 space-y-6">
        {setupTab === "ai" && (
          <>
            {!isOwner && <MemberReadOnlyNotice tab="AI" />}
            <ProjectAISettings
              projectId={projectId}
              disabled={busy !== null || !isOwner}
              onSaved={() => setAiConfigured(true)}
            />
          </>
        )}

        {setupTab === "execution" && (
          <>
            {!isOwner && <MemberReadOnlyNotice tab="Execution" />}
            <ProjectExecutionSettings
              projectId={projectId}
              platformType={platform}
              disabled={busy !== null || !isOwner}
            />
          </>
        )}

        {setupTab === "git" && (
          <ProjectGitSettings projectId={projectId} disabled={busy !== null} isOwner={isOwner} />
        )}

        {setupTab === "jira" && (
          <>
            {!isOwner && <MemberReadOnlyNotice tab="Jira" />}
            <ProjectJiraSettings projectId={projectId} disabled={busy !== null || !isOwner} />
          </>
        )}

        {setupTab === "environments" && <div className="space-y-3 rounded-xl border border-white/10 bg-ink-950/30 p-4">
          <h3 className="text-sm font-semibold text-white">Environments</h3>
          <ul className="space-y-2 text-sm text-zinc-300">
            {project.environments.length === 0 ? <li className="text-zinc-500">No environments yet.</li> : null}
            {project.environments.map((env) => {
              let pretty = env.configJson;
              try { pretty = JSON.stringify(JSON.parse(env.configJson) as unknown, null, 2); } catch { /* keep raw */ }
              return (
                <li key={env.id} className="rounded-lg border border-white/5 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium text-white">
                      {env.name}{" "}
                      <span className="text-xs font-normal text-zinc-500">({env.slug})</span>
                    </p>
                    <div className="flex shrink-0 gap-3">
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => startEditEnvironment(env)}
                        className="text-xs text-cyan-300 hover:underline disabled:opacity-40"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void deleteEnvironment(env.id)}
                        className="text-xs text-rose-300 hover:underline disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                  <pre className="mt-2 max-h-40 overflow-auto rounded-md bg-black/30 p-2 text-[11px] leading-relaxed text-zinc-400 whitespace-pre">{pretty}</pre>
                </li>
              );
            })}
          </ul>

          <form className="space-y-2 border-t border-white/10 pt-3" onSubmit={saveEnvironment}>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="text-xs text-zinc-400">
                Name
                <input
                  value={envName}
                  onChange={(e) => setEnvName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white"
                  required
                  maxLength={80}
                />
              </label>
              <label className="text-xs text-zinc-400">
                Slug
                <input
                  value={envSlug}
                  onChange={(e) => setEnvSlug(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white"
                  required
                  maxLength={64}
                  placeholder="staging"
                  disabled={isEditing}
                />
              </label>
            </div>
            <label className="text-xs text-zinc-400">
              {runnerLabel} config JSON
              <textarea
                value={envConfig}
                onChange={(e) => setEnvConfig(e.target.value)}
                rows={10}
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 font-mono text-[11px] text-zinc-200"
              />
            </label>
            <p className="text-[11px] text-zinc-500">
              Select this environment in Test plans before generating tests.
              {isWeb
                ? ` Values such as baseURL and browser are merged into ${configLabel}.`
                : " Optional: deepLinkPrefix for app-specific flows (not written to mobilewright.config.ts)."}
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="submit"
                disabled={busy !== null}
                className="ui-btn-secondary ui-btn-sm w-full"
              >
                {busy === "env" ? "Saving…" : isEditing ? "Save changes" : "Add environment"}
              </button>
              {isEditing ? (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={resetEnvironmentForm}
                  className="ui-btn-tertiary ui-btn-sm w-full"
                >
                  Cancel
                </button>
              ) : null}
            </div>
          </form>
        </div>}
      </div>
    </section>
  );
}

function RequirementForm({
  disabled,
  onSubmit,
}: {
  disabled: boolean;
  onSubmit: (title: string, content: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSubmit(title, content);
        setTitle("");
        setContent("");
      }}
    >
      <label className="block text-xs font-medium text-zinc-400">
        Title (optional)
        <input
          value={title}
          disabled={disabled}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:ring-2"
          placeholder="Guest checkout"
        />
      </label>
      <label className="block text-xs font-medium text-zinc-400">
        Requirement text
        <textarea
          value={content}
          disabled={disabled}
          onChange={(e) => setContent(e.target.value)}
          required
          minLength={1}
          maxLength={48_000}
          rows={10}
          className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:ring-2"
          placeholder="As a shopper, I can …"
        />
      </label>
      <button
        type="submit"
        disabled={disabled}
        className="ui-btn-primary w-full"
      >
        {disabled ? "Working…" : "Save requirement"}
      </button>
    </form>
  );
}
