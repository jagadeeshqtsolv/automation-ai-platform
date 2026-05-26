"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { WorkspaceToolbar } from "@/components/workspace-toolbar";
import { projectPlatformLabel, type ProjectPlatformType } from "@automation-ai/core";
import { readApiError } from "@/lib/api-response";
import { readSelectedOrganizationId, writeSelectedOrganizationId } from "@/lib/selected-organization";

type ProjectCounts = {
  requirements: number;
  environments: number;
  pageObjects: number;
  testPlans: number;
  testCases: number;
  generatedCodes: number;
};

type ProjectRow = {
  id: string;
  name: string;
  createdAt: string;
  counts: ProjectCounts;
};

type AnalyticsPayload = {
  currentUserRole: "owner" | "member";
  totals: {
    projects: number;
    requirements: number;
    environments: number;
    pageObjects: number;
    testPlans: number;
    testCases: number;
    generatedCodes: number;
  };
  projects: ProjectRow[];
};

function formatInt(n: number): string {
  return n.toLocaleString();
}

function MetricCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="ui-metric">
      <p className="ui-eyebrow">{label}</p>
      <p className="ui-metric-value">{formatInt(value)}</p>
      {hint !== undefined ? <p className="mt-1 text-xs text-zinc-500">{hint}</p> : null}
    </div>
  );
}

export function DashboardWorkspace() {
  const toast = useToast();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  const load = useCallback(async () => {
    if (organizationId === null) {
      setData(null);
      return;
    }
    const res = await fetch(`/api/dashboard/analytics?organizationId=${encodeURIComponent(organizationId)}`);
    if (!res.ok) {
      toast.error("Could not load dashboard");
      setData(null);
      return;
    }
    const json = (await res.json()) as AnalyticsPayload;
    setData(json);
  }, [organizationId, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleOrganizationChange = useCallback((nextId: string) => {
    writeSelectedOrganizationId(nextId);
    setOrganizationId(nextId);
  }, []);

  const handleWorkspaceReady = useCallback(() => {
    setWorkspaceReady(true);
  }, []);

  return (
    <div className="space-y-8">
      <WorkspaceToolbar
        organizationId={organizationId}
        onOrganizationChange={handleOrganizationChange}
        onReady={handleWorkspaceReady}
      />

      {!workspaceReady ? (
        <p className="text-sm text-zinc-400">Loading workspace…</p>
      ) : organizationId === null ? (
        <div className="space-y-2 text-sm text-zinc-400">
          <p>No workspace is available for your account.</p>
          <p className="text-xs text-zinc-500">
            Ask an administrator to add you to an enabled organization. If you just updated the app, restart{" "}
            <code className="text-zinc-300">npm run dev</code> after schema changes.
          </p>
        </div>
      ) : (
        <DashboardContent organizationId={organizationId} data={data} onReload={load} />
      )}
    </div>
  );
}

function DashboardContent({
  organizationId,
  data,
  onReload,
}: {
  organizationId: string;
  data: AnalyticsPayload | null;
  onReload: () => void;
}) {
  return (
    <div className="space-y-10">
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Organization overview</h2>
        <p className="mt-1 text-sm text-zinc-400">Totals across projects you can access in this organization.</p>
        {data === null ? (
          <p className="mt-4 text-sm text-zinc-400">Loading metrics…</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
            <MetricCard label="Projects" value={data.totals.projects} />
            <MetricCard label="Requirements" value={data.totals.requirements} hint="Captured intent" />
            <MetricCard label="Environments" value={data.totals.environments} hint="Targets & config" />
            <MetricCard label="Page objects" value={data.totals.pageObjects} hint="Screens on disk + DB" />
            <MetricCard label="Test plans" value={data.totals.testPlans} hint="LLM plans" />
            <MetricCard label="Test cases" value={data.totals.testCases} hint="Across all plans" />
            <MetricCard label="Generated code" value={data.totals.generatedCodes} hint="Compiled outputs" />
          </div>
        )}
      </section>

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <section className="rounded-2xl border border-white/10 bg-ink-900/50 p-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Projects</h2>
          <p className="mt-1 text-sm text-zinc-400">Each project has its own requirements, environments, page objects, and generated test code.</p>
          <div className="mt-4">
            {data === null ? (
              <p className="text-sm text-zinc-400">Loading…</p>
            ) : data.projects.length === 0 ? (
              <p className="text-sm text-zinc-400">No projects yet. Create your first one using the form on the right.</p>
            ) : (
              <ul className="divide-y divide-white/10 rounded-xl border border-white/10 bg-ink-950/40">
                {data.projects.map((p) => (
                  <li key={p.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-white">{p.name}</p>
                      <p className="text-xs text-zinc-500">{new Date(p.createdAt).toLocaleString()}</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <CountPill label="Req" n={p.counts.requirements} />
                        <CountPill label="Env" n={p.counts.environments} />
                        <CountPill label="POM" n={p.counts.pageObjects} />
                        <CountPill label="Plans" n={p.counts.testPlans} />
                        <CountPill label="Cases" n={p.counts.testCases} />
                        <CountPill label="Code" n={p.counts.generatedCodes} />
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:self-center">
                      <Link
                        href={`/projects/${p.id}`}
                        className="ui-btn-secondary ui-btn-xs text-center"
                        data-testid={`project-open-link-${p.id}`}
                      >
                        Open
                      </Link>
                      {data.currentUserRole === "owner" && (
                        <DeleteProjectButton projectId={p.id} projectName={p.name} onDeleted={onReload} />
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="h-fit rounded-2xl border border-white/10 bg-ink-900/50 p-6">
          <h2 className="text-sm font-semibold text-white">New project</h2>
          <p className="mt-2 text-sm text-zinc-400">Set up a workspace for your application&apos;s test requirements, environments, and generated test code.</p>
          <div className="mt-4">
            <CreateProjectForm organizationId={organizationId} onCreated={() => void onReload()} />
          </div>
        </aside>
      </div>
    </div>
  );
}

function CountPill({ label, n }: { label: string; n: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[11px] font-medium text-zinc-300">
      <span className="text-zinc-500">{label}</span>
      <span className="tabular-nums text-zinc-200">{n}</span>
    </span>
  );
}

function DeleteProjectButton({
  projectId,
  projectName,
  onDeleted,
}: {
  projectId: string;
  projectName: string;
  onDeleted: () => void;
}) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete project "${projectName}"? All data and the framework folder will be removed.`,
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
      onDeleted();
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => void handleDelete()}
      className="rounded-lg border border-rose-500/25 px-3 py-1.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/10 disabled:opacity-50"
      data-testid={`project-delete-btn-${projectId}`}
    >
      {busy ? "…" : "Delete"}
    </button>
  );
}

function CreateProjectForm({
  organizationId,
  onCreated,
}: {
  organizationId: string;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [platformType, setPlatformType] = useState<ProjectPlatformType>("web");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, organizationId, platformType }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not create project"));
        return;
      }
      const body = (await res.json()) as { name?: string };
      const createdName = body.name ?? name;
      setName("");
      toast.success(
        `Project "${createdName}" created — framework dependencies are installing in the background`,
      );
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3" data-testid="create-project-form">
      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-zinc-400">Platform</legend>
        <div className="flex gap-2">
          {/* Web — available */}
          <label
            className={`flex flex-1 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
              platformType === "web"
                ? "border-accent/50 bg-accent/10 text-white"
                : "border-white/10 text-zinc-400 hover:border-white/20"
            }`}
          >
            <input
              type="radio"
              name="platformType"
              value="web"
              checked={platformType === "web"}
              onChange={() => setPlatformType("web")}
              className="sr-only"
              data-testid="create-project-platform-web-radio"
            />
            {projectPlatformLabel("web")}
          </label>

          {/* Mobile — coming soon */}
          <div className="flex flex-1 cursor-not-allowed items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2 text-xs text-zinc-600 select-none">
            {projectPlatformLabel("mobile")}
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-zinc-500">
              Coming soon
            </span>
          </div>
        </div>
        <p className="text-[10px] text-zinc-500">
          Web automation runs in the browser using Playwright. This cannot be changed after the project is created.
        </p>
      </fieldset>
      <label className="block text-xs font-medium text-zinc-400">
        Name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white outline-none ring-accent/40 focus:ring-2"
          placeholder="Checkout redesign"
          required
          maxLength={120}
          data-testid="create-project-name-input"
        />
      </label>
      <button
        type="submit"
        disabled={busy}
        className="ui-btn-primary ui-btn-sm w-full"
        data-testid="create-project-submit-btn"
      >
        {busy ? "Creating…" : "Create project"}
      </button>
    </form>
  );
}
