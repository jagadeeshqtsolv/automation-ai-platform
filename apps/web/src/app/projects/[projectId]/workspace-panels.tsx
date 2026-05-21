"use client";

import { useState, type ReactNode } from "react";
import { useToast } from "@/components/toast-provider";
import type { ProjectPlatformType } from "@automation-ai/shared";
import { testRunnerDisplayName } from "@/lib/test-framework";
import type { WorkspaceTab } from "./project-workspace-nav";

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
    { label: "Test plans", value: planCount, tab: "test-plans" as const },
    { label: "Page objects", value: project.pageObjects.length, tab: "generate-pom" as const },
    { label: "Test cases", value: testCaseCount, tab: "test-plans" as const },
  ];

  const shortcuts: Array<{ tab: WorkspaceTab; title: string; body: string }> = [
    { tab: "setup", title: "Configure project", body: "OpenAI key, execution provider, and environment definitions." },
    { tab: "requirements", title: "Write requirements", body: "Paste acceptance criteria and generate test plans." },
    {
      tab: "recorder",
      title: "Recorder",
      body: "Mobile: device accessibility tree. Web: headed browser and DOM capture.",
    },
    { tab: "generate-pom", title: "Page objects", body: "Browse and edit classes saved from the recorder." },
    {
      tab: "test-plans",
      title: "Test plan library",
      body: `Review generated plans and run ${codegenLabel} codegen.`,
    },
    { tab: "test-execution", title: "Run tests", body: "Select specs and stream live CLI logs." },
    { tab: "test-reports", title: "Test reports", body: "HTML reports, pass/fail breakdown, and step details." },
    { tab: "framework", title: "View framework files", body: "Inspect generated files on disk." },
  ];

  return (
    <section className="ui-panel animate-slide-up">
      <div className="ui-panel-header">
        <h2 className="ui-title">Overview</h2>
        <p className="ui-subtitle">Quick snapshot of this project workspace.</p>
      </div>

      <div className="ui-panel-body space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={() => onNavigate(c.tab)}
            className="ui-metric text-left hover:border-accent/30"
          >
            <p className="ui-eyebrow">{c.label}</p>
            <p className="ui-metric-value">{c.value}</p>
          </button>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {shortcuts.map((s) => (
          <button
            key={`${s.tab}-${s.title}`}
            type="button"
            onClick={() => onNavigate(s.tab)}
            className="rounded-xl border border-white/[0.08] bg-ink-950/40 p-4 text-left transition duration-200 hover:border-white/[0.14] hover:bg-white/[0.04]"
          >
            <p className="text-sm font-semibold tracking-tight text-white">{s.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-400">{s.body}</p>
          </button>
        ))}
      </div>
      </div>
    </section>
  );
}

export function RequirementsWorkspacePanel({
  project,
  busy,
  onGeneratePlan,
  onCreatePlan,
  onUpdateRequirement,
  onDeleteRequirement,
  onRefresh,
  onViewTestPlans,
  requirementForm,
}: {
  project: ProjectPanelsData;
  busy: string | null;
  onGeneratePlan: (requirementId: string) => Promise<void>;
  onCreatePlan: (requirementId: string, suiteName: string) => Promise<void>;
  onUpdateRequirement: (requirementId: string, title: string, content: string) => Promise<void>;
  onDeleteRequirement: (requirementId: string, title: string | null, planCount: number) => Promise<void>;
  onRefresh: () => void;
  onViewTestPlans: () => void;
  requirementForm: ReactNode;
}) {
  const totalPlans = project.requirements.reduce((n, r) => n + r.testPlans.length, 0);

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-white/10 bg-ink-900/30 p-4 sm:p-5">
        <h2 className="text-lg font-semibold text-white">Requirements</h2>
        <p className="mt-1 text-sm text-zinc-400">
          Capture product intent, then generate structured test plans. View and run codegen on the{" "}
          <button
            type="button"
            onClick={onViewTestPlans}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            Test plans
          </button>{" "}
          tab ({totalPlans} saved).
        </p>
      </header>

      <div className="grid gap-8 xl:grid-cols-[360px_1fr]">
        <section className="space-y-4 rounded-2xl border border-white/10 bg-ink-900/50 p-6">
          <div>
            <h2 className="text-lg font-semibold text-white">New requirement</h2>
            <p className="mt-1 text-sm text-zinc-400">Paste PRD snippets, acceptance criteria, or user stories.</p>
          </div>
          {requirementForm}
        </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-white">Saved requirements</h2>
            <button
              type="button"
              onClick={onRefresh}
              className="text-xs font-semibold text-zinc-400 underline-offset-4 hover:text-white hover:underline"
            >
              Refresh
            </button>
          </div>

          {project.requirements.length === 0 ? (
            <p className="text-sm text-zinc-500">No requirements yet.</p>
          ) : (
            <div className="space-y-4">
              {project.requirements.map((req) => (
                <SavedRequirementCard
                  key={req.id}
                  requirement={req}
                  busy={busy}
                  onGeneratePlan={onGeneratePlan}
                  onCreatePlan={onCreatePlan}
                  onUpdateRequirement={onUpdateRequirement}
                  onDeleteRequirement={onDeleteRequirement}
                />
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function defaultSuiteNameForRequirement(requirementTitle: string | null): string {
  const title = requirementTitle?.trim();
  return title !== undefined && title.length > 0 ? title : "Test suite";
}

function SavedRequirementCard({
  requirement,
  busy,
  onGeneratePlan,
  onCreatePlan,
  onUpdateRequirement,
  onDeleteRequirement,
}: {
  requirement: Requirement;
  busy: string | null;
  onGeneratePlan: (requirementId: string) => Promise<void>;
  onCreatePlan: (requirementId: string, suiteName: string) => Promise<void>;
  onUpdateRequirement: (requirementId: string, title: string, content: string) => Promise<void>;
  onDeleteRequirement: (requirementId: string, title: string | null, planCount: number) => Promise<void>;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(requirement.title ?? "");
  const [content, setContent] = useState(requirement.content);
  const saving = busy === `edit-req:${requirement.id}`;
  const deleting = busy === `delete-req:${requirement.id}`;

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
    <article className="rounded-2xl border border-white/10 bg-ink-900/40 p-5">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold text-white">{requirement.title ?? "Untitled requirement"}</h3>
          <p className="text-xs text-zinc-500">{new Date(requirement.createdAt).toLocaleString()}</p>
          {requirement.testPlans.length > 0 ? (
            <p className="mt-1 text-xs text-zinc-400">
              {requirement.testPlans.length} test plan{requirement.testPlans.length === 1 ? "" : "s"} in library
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {!editing ? (
            <button
              type="button"
              disabled={busy !== null}
              onClick={startEdit}
              className="rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Edit
            </button>
          ) : null}
          <button
            type="button"
            disabled={busy !== null || editing}
            onClick={() => void onCreatePlan(requirement.id, defaultSuiteNameForRequirement(requirement.title))}
            className="rounded-lg border border-white/10 bg-ink-950/60 px-3 py-1.5 text-xs font-semibold text-zinc-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === `create-plan:${requirement.id}` ? "Creating…" : "Create test plan"}
          </button>
          <button
            type="button"
            disabled={busy !== null || editing}
            onClick={() => void onGeneratePlan(requirement.id)}
            className="ui-btn-primary ui-btn-xs disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === `plan:${requirement.id}` ? "Generating…" : "Generate test plan"}
          </button>
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
            className="rounded-lg border border-rose-500/30 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </header>

      {editing ? (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            void saveEdit();
          }}
        >
          <label className="block text-xs font-medium text-zinc-400">
            Title (optional)
            <input
              value={title}
              disabled={saving}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:ring-2"
            />
          </label>
          <label className="block text-xs font-medium text-zinc-400">
            Requirement text
            <textarea
              value={content}
              disabled={saving}
              onChange={(e) => setContent(e.target.value)}
              required
              minLength={1}
              maxLength={48_000}
              rows={10}
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:ring-2"
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="ui-btn-primary ui-btn-sm">
              {saving ? "Saving…" : "Save changes"}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={cancelEdit}
              className="ui-btn-secondary ui-btn-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <pre className="mt-4 max-h-48 overflow-auto rounded-xl border border-white/10 bg-ink-950/60 p-3 text-xs leading-relaxed text-zinc-300">
          {requirement.content}
        </pre>
      )}
    </article>
  );
}
