import type { ProjectPlatformType } from "@jagadeeshqtsolv/core";
import type { WorkspaceNavItem, WorkspaceTab } from "./project-workspace-nav";

/** Left-rail order matches product flow: configure → define → capture → generate → run → export. */
export const WORKSPACE_TAB_ORDER: readonly WorkspaceTab[] = [
  "overview",
  "setup",
  "requirements",
  "recorder",
  "generate-pom",
  "test-plans",
  "test-execution",
  "test-reports",
  "framework",
];

type WorkspaceNavStats = {
  requirementsCount: number;
  planCount: number;
  environmentsCount: number;
  pageObjectsCount: number;
};

export function buildWorkspaceNavItems(
  stats: WorkspaceNavStats,
  platformType: ProjectPlatformType = "mobile",
): WorkspaceNavItem[] {
  const byTab: Record<WorkspaceTab, WorkspaceNavItem> = {
    overview: { id: "overview", label: "Overview", description: "Project summary" },
    setup: {
      id: "setup",
      label: "Setup",
      description: "Configure Test Environment",
      badge: stats.environmentsCount,
    },
    requirements: {
      id: "requirements",
      label: "Requirements",
      description: "Define Requirements",
      badge: stats.requirementsCount,
    },
    recorder: {
      id: "recorder",
      label: "Recorder",
      description: platformType === "web" ? "Capture Application Interactions" : "Connect device & capture",
    },
    "generate-pom": {
      id: "generate-pom",
      label: "Page Objects",
      description: "Import & Manage Page Objects",
      badge: stats.pageObjectsCount,
    },
    "test-plans": {
      id: "test-plans",
      label: "Test Plans",
      description: "Create And Review Test Plans",
      badge: stats.planCount,
    },
    "test-execution": {
      id: "test-execution",
      label: "Test execution",
      description: "Run Automated Test Suites",
    },
    "test-reports": {
      id: "test-reports",
      label: "Test reports",
      description: "Analyze Execution Results",
    },
    framework: { id: "framework", label: "Framework", description: "Export Automation Framework" },
  };

  return WORKSPACE_TAB_ORDER.map((id) => byTab[id]);
}
