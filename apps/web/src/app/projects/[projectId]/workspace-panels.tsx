"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/components/toast-provider";
import type { ProjectPlatformType } from "@automation-ai/core";
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
  onGeneratePlan: (requirementId: string) => Promise<void>;
  onCreatePlan: (requirementId: string, suiteName: string) => Promise<void>;
  onUpdateRequirement: (requirementId: string, title: string, content: string) => Promise<void>;
  onDeleteRequirement: (requirementId: string, title: string | null, planCount: number) => Promise<void>;
  onRefresh: () => void;
  onViewTestPlans: () => void;
  onCreateRequirement?: (title: string, content: string) => Promise<void>;
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

      {onCreateRequirement !== undefined && (
        <JiraImportSection projectId={projectId} onCreateRequirement={onCreateRequirement} onRefresh={onRefresh} />
      )}

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
      .catch(() => {});
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
    <section className="rounded-2xl border border-white/10 bg-ink-900/30">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2">
          <JiraIcon />
          <span className="text-sm font-semibold text-white">Import from Jira</span>
        </span>
        <ChevronIcon expanded={expanded} />
      </button>

      {expanded && (
        <div className="border-t border-white/10 px-5 py-4 space-y-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
            <label className="block text-xs text-zinc-400">
              JQL query
              <input
                value={jql}
                onChange={(e) => setJql(e.target.value)}
                placeholder='project = MYPROJ AND issuetype = Story AND status != Done ORDER BY created DESC'
                maxLength={500}
                disabled={fetching}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void onFetch(); } }}
                className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white disabled:opacity-50"
              />
            </label>
            <button
              type="button"
              onClick={() => void onFetch()}
              disabled={fetching || !jql.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-zinc-300 hover:bg-white/[0.07] disabled:opacity-50 transition whitespace-nowrap"
            >
              {fetching ? <><JiraSpinner />Fetching…</> : "Fetch stories"}
            </button>
          </div>

          <label className="block text-xs text-zinc-400">
            Instructions{" "}
            <span className="text-zinc-500">(optional — prepended to each imported requirement)</span>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={2}
              maxLength={4000}
              placeholder="e.g. These are mobile checkout user stories. Focus on edge cases and error handling."
              className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-sm text-white"
            />
          </label>

          {stories.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                  <input
                    type="checkbox"
                    checked={selected.size === stories.length && stories.length > 0}
                    onChange={(e) => toggleAll(e.target.checked)}
                    className="rounded"
                  />
                  Select all ({stories.length} stories)
                </label>
                <button
                  type="button"
                  onClick={() => void onImport()}
                  disabled={importing || selected.size === 0}
                  className="ui-btn-primary ui-btn-sm disabled:opacity-50"
                >
                  {importing ? <><JiraSpinner />Importing…</> : `Import selected (${selected.size})`}
                </button>
              </div>

              <ul className="max-h-80 space-y-1.5 overflow-y-auto rounded-xl border border-white/[0.08] bg-ink-950/30 p-2">
                {stories.map((story) => (
                  <li
                    key={story.key}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleStory(story.key)}
                    onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") toggleStory(story.key); }}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition hover:bg-white/[0.03] ${
                      selected.has(story.key)
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
                        <span className="font-mono text-[11px] font-semibold text-accent">{story.key}</span>
                        <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
                          {story.issueType}
                        </span>
                        <span className="rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-500">
                          {story.status}
                        </span>
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-xs text-zinc-200">{story.summary}</p>
                      {story.description.length > 0 && (
                        <p className="mt-0.5 line-clamp-2 text-[11px] text-zinc-500">{story.description}</p>
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
      className={`h-4 w-4 text-zinc-400 transition-transform ${expanded ? "rotate-180" : ""}`}
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
