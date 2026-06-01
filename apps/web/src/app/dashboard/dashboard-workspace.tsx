"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { WorkspaceToolbar } from "@/components/workspace-toolbar";
import { projectPlatformLabel, type ProjectPlatformType } from "@jagadeeshqtsolv/core";
import { readApiError } from "@/lib/api-response";
import { writeSelectedOrganizationId } from "@/lib/selected-organization";

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

const PAGE_SIZE = 5;

const METRIC_CONFIG = [
  { key: "projects" as const,       label: "Projects",        icon: "🗂️", color: "text-violet-700", bg: "bg-violet-50",  border: "border-violet-100" },
  { key: "requirements" as const,   label: "Requirements",    icon: "📋", color: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-100" },
  { key: "environments" as const,   label: "Environments",    icon: "🌐", color: "text-cyan-700",   bg: "bg-cyan-50",    border: "border-cyan-100" },
  { key: "pageObjects" as const,    label: "Page Objects",    icon: "🧩", color: "text-amber-700",  bg: "bg-amber-50",   border: "border-amber-100" },
  { key: "testPlans" as const,      label: "Test Plans",      icon: "🗺️", color: "text-emerald-700",bg: "bg-emerald-50", border: "border-emerald-100" },
  { key: "testCases" as const,      label: "Test Cases",      icon: "✅", color: "text-green-700",  bg: "bg-green-50",   border: "border-green-100" },
  { key: "generatedCodes" as const, label: "Generated Code",  icon: "⚡", color: "text-rose-700",   bg: "bg-rose-50",    border: "border-rose-100" },
] as const;

const AVATAR_COLORS = [
  "bg-violet-100 text-violet-700",
  "bg-blue-100 text-blue-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-700",
  "bg-rose-100 text-rose-700",
  "bg-cyan-100 text-cyan-700",
];

function avatarColor(name: string) {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length;
  return AVATAR_COLORS[idx];
}

function projectActivity(p: ProjectRow): "active" | "setup" | "empty" {
  if (p.counts.testCases > 0) return "active";
  if (p.counts.requirements > 0 || p.counts.pageObjects > 0) return "setup";
  return "empty";
}

export function DashboardWorkspace() {
  const toast = useToast();
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [data, setData] = useState<AnalyticsPayload | null>(null);

  const load = useCallback(async () => {
    if (organizationId === null) { setData(null); return; }
    const res = await fetch(`/api/dashboard/analytics?organizationId=${encodeURIComponent(organizationId)}`);
    if (!res.ok) { toast.error("Could not load dashboard"); setData(null); return; }
    setData((await res.json()) as AnalyticsPayload);
  }, [organizationId, toast]);

  useEffect(() => { void load(); }, [load]);

  const handleOrganizationChange = useCallback((nextId: string) => {
    writeSelectedOrganizationId(nextId);
    setOrganizationId(nextId);
  }, []);

  return (
    <div className="space-y-6">
      <WorkspaceToolbar
        organizationId={organizationId}
        onOrganizationChange={handleOrganizationChange}
        onReady={() => setWorkspaceReady(true)}
      />
      {!workspaceReady ? (
        <p className="text-sm text-slate-500">Loading workspace…</p>
      ) : organizationId === null ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="font-medium text-slate-700">No workspace available</p>
          <p className="mt-1 text-xs text-slate-500">Ask an administrator to add you to an enabled organization.</p>
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
  const [showAll, setShowAll] = useState(false);
  const projects = data?.projects ?? [];
  const visible = showAll ? projects : projects.slice(0, PAGE_SIZE);
  const hidden = projects.length - visible.length;

  return (
    <div className="space-y-6">

      {/* ── Metric cards ────────────────────────────────────────────── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
        {METRIC_CONFIG.map((m) =>
          data === null ? (
            <div key={m.key} className={`animate-pulse rounded-xl border ${m.border} ${m.bg} px-4 py-4`}>
              <div className="h-3 w-16 rounded bg-current opacity-20" />
              <div className="mt-3 h-7 w-10 rounded bg-current opacity-20" />
            </div>
          ) : (
            <div key={m.key} className={`rounded-xl border ${m.border} ${m.bg} px-4 py-4`}>
              <div className="flex items-start justify-between">
                <p className={`text-xs font-semibold ${m.color}`}>{m.label}</p>
                <span className="text-lg leading-none">{m.icon}</span>
              </div>
              <p className={`mt-2 text-2xl font-bold tabular-nums ${m.color}`}>
                {data.totals[m.key].toLocaleString()}
              </p>
            </div>
          )
        )}
      </div>

      {/* ── Main content ────────────────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_280px]">

        {/* Projects table */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Projects</h2>
              <p className="text-xs text-slate-500">All automation workspaces</p>
            </div>
            {data !== null && (
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600">
                {data.projects.length}
              </span>
            )}
          </div>

          {data === null ? (
            <div className="divide-y divide-slate-100">
              {[1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className="h-9 w-9 rounded-lg bg-slate-100" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-40 rounded bg-slate-200" />
                      <div className="h-2.5 w-24 rounded bg-slate-100" />
                    </div>
                    <div className="h-6 w-16 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          ) : projects.length === 0 ? (
            <div className="flex flex-col items-center py-16 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-2xl">🗂️</div>
              <p className="mt-3 text-sm font-semibold text-slate-700">No projects yet</p>
              <p className="mt-1 text-xs text-slate-400">Create your first project from the panel on the right.</p>
            </div>
          ) : (
            <>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    <th className="px-5 py-2.5">Project</th>
                    <th className="px-3 py-2.5 text-center">Status</th>
                    <th className="px-3 py-2.5 text-right">Req</th>
                    <th className="px-3 py-2.5 text-right">POM</th>
                    <th className="px-3 py-2.5 text-right">Plans</th>
                    <th className="px-3 py-2.5 text-right">Cases</th>
                    <th className="px-5 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {visible.map((p) => {
                    const activity = projectActivity(p);
                    return (
                      <tr key={p.id} className="group transition-colors hover:bg-slate-50">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${avatarColor(p.name)}`}>
                              {p.name.charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{p.name}</p>
                              <p className="text-[10px] text-slate-400">
                                {new Date(p.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            activity === "active" ? "bg-green-50 text-green-700" :
                            activity === "setup"  ? "bg-amber-50 text-amber-700" :
                                                   "bg-slate-100 text-slate-500"
                          }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${
                              activity === "active" ? "bg-green-500" :
                              activity === "setup"  ? "bg-amber-400" :
                                                     "bg-slate-400"
                            }`} />
                            {activity === "active" ? "Active" : activity === "setup" ? "In Setup" : "Empty"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{p.counts.requirements}</td>
                        <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{p.counts.pageObjects}</td>
                        <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{p.counts.testPlans}</td>
                        <td className="px-3 py-3 text-right text-sm font-semibold text-slate-700">{p.counts.testCases}</td>
                        <td className="px-5 py-3">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/projects/${p.id}`}
                              className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-slate-700"
                              data-testid={`project-open-link-${p.id}`}
                            >
                              Open
                            </Link>
                            {data.currentUserRole === "owner" && (
                              <DeleteProjectButton projectId={p.id} projectName={p.name} onDeleted={onReload} />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {projects.length > PAGE_SIZE && (
                <div className="border-t border-slate-100 px-5 py-3 text-center">
                  <button
                    type="button"
                    onClick={() => setShowAll((v) => !v)}
                    className="text-xs font-medium text-slate-500 hover:text-slate-900"
                  >
                    {showAll ? "Show less" : `Show ${hidden} more project${hidden === 1 ? "" : "s"}`}
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {/* Right column */}
        <div className="flex flex-col gap-4">

          {/* New Project */}
          <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3.5">
              <h2 className="text-sm font-semibold text-slate-900">New Project</h2>
              <p className="text-xs text-slate-500">Set up a new automation workspace</p>
            </div>
            <div className="p-4">
              <CreateProjectForm organizationId={organizationId} onCreated={() => void onReload()} />
            </div>
          </div>

          {/* Getting started checklist */}
          {data !== null && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-3.5">
                <h2 className="text-sm font-semibold text-slate-900">Getting Started</h2>
                <p className="text-xs text-slate-500">Steps to run your first test</p>
              </div>
              <ul className="divide-y divide-slate-100 px-4 py-2">
                <ChecklistItem done={data.totals.projects > 0} label="Create a project" />
                <ChecklistItem done={data.totals.requirements > 0} label="Add requirements" />
                <ChecklistItem done={data.totals.pageObjects > 0} label="Set up page objects" />
                <ChecklistItem done={data.totals.testPlans > 0} label="Generate a test plan" />
                <ChecklistItem done={data.totals.testCases > 0} label="Review test cases" />
                <ChecklistItem done={data.totals.generatedCodes > 0} label="Generate & run tests" />
              </ul>
              <div className="px-4 pb-3">
                <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-green-500 transition-all"
                    style={{
                      width: `${Math.round(
                        ([data.totals.projects, data.totals.requirements, data.totals.pageObjects, data.totals.testPlans, data.totals.testCases, data.totals.generatedCodes].filter(Boolean).length / 6) * 100
                      )}%`,
                    }}
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400">
                  {[data.totals.projects, data.totals.requirements, data.totals.pageObjects, data.totals.testPlans, data.totals.testCases, data.totals.generatedCodes].filter(Boolean).length} / 6 steps complete
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ChecklistItem({ done, label }: { done: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2.5 py-2">
      <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${done ? "bg-green-500" : "bg-slate-200"}`}>
        {done && (
          <svg className="h-2.5 w-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </span>
      <span className={`text-xs ${done ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
    </li>
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
    const confirmed = window.confirm(`Delete Project "${projectName}"? All data and the framework folder will be removed.`);
    if (!confirmed) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) { toast.error(await readApiError(res, "Could not delete project")); return; }
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
      className="rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1.5 text-xs font-semibold text-rose-600 transition hover:bg-rose-100 disabled:opacity-50"
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

  async function onSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, organizationId, platformType }),
      });
      if (!res.ok) { toast.error(await readApiError(res, "Could not create project")); return; }
      const body = (await res.json()) as { name?: string };
      setName("");
      toast.success(`Project "${body.name ?? name}" created — framework dependencies are installing`);
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" data-testid="create-project-form">
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-slate-600">Platform</legend>
        <div className="grid grid-cols-2 gap-2">
          <label className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2.5 text-xs font-medium transition ${
            platformType === "web"
              ? "border-green-300 bg-green-50 text-green-800 shadow-sm"
              : "border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50"
          }`}>
            <input type="radio" name="platformType" value="web" checked={platformType === "web"}
              onChange={() => setPlatformType("web")} className="sr-only"
              data-testid="create-project-platform-web-radio" />
            <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
            </svg>
            {projectPlatformLabel("web")}
          </label>

          <div className="flex cursor-not-allowed flex-col gap-0.5 overflow-hidden rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 select-none">
            <div className="flex items-center gap-1.5 text-xs text-slate-400">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
              </svg>
              <span>{projectPlatformLabel("mobile")}</span>
            </div>
            <span className="w-fit rounded bg-slate-200 px-1.5 py-px text-[9px] font-semibold uppercase text-slate-500">Coming Soon</span>
          </div>
        </div>
        <p className="text-[11px] text-slate-400">Web uses Playwright. Cannot be changed after creation.</p>
      </fieldset>

      <div>
        <label className="block text-xs font-semibold text-slate-600">
          Project Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-green-400 focus:ring-2 focus:ring-green-400/20"
            placeholder="e.g. Checkout redesign"
            required maxLength={120}
            data-testid="create-project-name-input"
          />
        </label>
      </div>

      <button type="submit" disabled={busy} className="ui-btn-primary ui-btn-sm w-full" data-testid="create-project-submit-btn">
        {busy ? "Creating…" : "Create Project"}
      </button>
    </form>
  );
}
