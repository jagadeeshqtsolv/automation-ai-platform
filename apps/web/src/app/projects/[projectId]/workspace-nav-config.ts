import type { ProjectPlatformType } from "@automation-ai/shared";
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
      description: "API keys, execution & environments",
      badge: stats.environmentsCount,
    },
    requirements: {
      id: "requirements",
      label: "Requirements",
      description: "Write & generate plans",
      badge: stats.requirementsCount,
    },
    recorder: {
      id: "recorder",
      label: "Recorder",
      description: platformType === "web" ? "Browser DOM capture" : "Connect device & capture",
    },
    "generate-pom": {
      id: "generate-pom",
      label: "Page objects",
      description: "Browse & edit library",
      badge: stats.pageObjectsCount,
    },
    "test-plans": {
      id: "test-plans",
      label: "Test plans",
      description: "Review plans & codegen",
      badge: stats.planCount,
    },
    "test-execution": {
      id: "test-execution",
      label: "Test execution",
      description: "Run specs & live logs",
    },
    "test-reports": {
      id: "test-reports",
      label: "Test reports",
      description: "HTML report & run history",
    },
    framework: { id: "framework", label: "Framework", description: "Zip & files on disk" },
  };

  return WORKSPACE_TAB_ORDER.map((id) => byTab[id]);
}
