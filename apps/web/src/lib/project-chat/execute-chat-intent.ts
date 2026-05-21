import { cancelActiveTestRun } from "@/lib/test-execution/active-test-run-process";
import { listTestSpecFiles } from "@/lib/test-execution/list-test-specs";
import {
  startProjectTestRun,
  startRerunFailuresForProject,
} from "@/lib/test-execution/start-project-test-run";
import { parseNavigateTab } from "@/lib/project-chat/parse-chat-intent";
import type { ChatIntent, ChatReply } from "@/lib/project-chat/types";
import { summarizeResultsAnalysis } from "@/lib/test-execution/playwright-report-analysis";
import { prisma } from "@/lib/prisma";

const HELP_TEXT = `Project assistant commands (no LLM required):
• **status** — last test run
• **list specs** — test files on disk
• **list page objects** — saved page classes
• **run tests** — run all specs
• **stop** — cancel in-progress run
• **rerun failures** — rerun failed cases from last run
• **open reports** / **open execution** — jump to a workspace tab
Type **help** anytime.`;

export async function executeChatIntent(
  projectId: string,
  intent: ChatIntent,
  rawMessage: string,
): Promise<ChatReply> {
  switch (intent) {
    case "help":
      return { message: HELP_TEXT, intent };

    case "status": {
      const running = await prisma.testRun.findFirst({
        where: { projectId, status: "running", finishedAt: null },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      });
      if (running !== null) {
        return {
          message: `Test run **in progress** (id: \`${running.id.slice(0, 8)}…\`). Open **Test execution** for live logs, or say **stop**.`,
          intent,
          actions: [
            { type: "navigate", tab: "test-execution" },
            { type: "highlight_run", runId: running.id },
          ],
        };
      }

      const last = await prisma.testRun.findFirst({
        where: { projectId },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          exitCode: true,
          finishedAt: true,
          resultsAnalysis: true,
        },
      });
      if (last === null) {
        return { message: "No test runs yet. Say **run tests** to start one.", intent };
      }

      const summary = summarizeResultsAnalysis(last.resultsAnalysis);
      const parts = [
        `Last run: **${last.status}**`,
        last.exitCode !== null ? `exit code ${last.exitCode}` : null,
        last.finishedAt !== null ? `finished ${last.finishedAt.toISOString()}` : null,
      ].filter((p): p is string => p !== null);

      if (summary !== undefined) {
        parts.push(
          `passed ${summary.passed}, failed ${summary.failed}, flaky ${summary.flaky}, skipped ${summary.skipped}`,
        );
      }

      return {
        message: parts.join(" · "),
        intent,
        actions: [{ type: "navigate", tab: "test-reports" }, { type: "highlight_run", runId: last.id }],
      };
    }

    case "list_specs": {
      const specs = await listTestSpecFiles(projectId);
      if (specs.length === 0) {
        return { message: "No spec files under `tests/` (excluding `tests/deleted/`).", intent };
      }
      const lines = specs.slice(0, 30).map((s) => `• ${s.path}`);
      const more = specs.length > 30 ? `\n… and ${specs.length - 30} more` : "";
      return {
        message: `**${specs.length}** spec file(s):\n${lines.join("\n")}${more}`,
        intent,
      };
    }

    case "list_page_objects": {
      const rows = await prisma.pageObject.findMany({
        where: { projectId },
        orderBy: { modulePath: "asc" },
        select: { className: true, modulePath: true, screenName: true },
      });
      if (rows.length === 0) {
        return { message: "No page objects saved for this project yet.", intent };
      }
      const lines = rows.map(
        (r) => `• **${r.className}** (\`${r.modulePath}\`)${r.screenName !== null ? ` — ${r.screenName}` : ""}`,
      );
      return {
        message: `**${rows.length}** page object(s):\n${lines.join("\n")}`,
        intent,
        actions: [{ type: "navigate", tab: "generate-pom" }],
      };
    }

    case "run_all": {
      const result = await startProjectTestRun({ projectId });
      if (!result.ok) {
        return {
          message: result.error,
          intent,
          ...(result.runId !== undefined
            ? { actions: [{ type: "navigate", tab: "test-execution" as const }] }
            : {}),
        };
      }
      return {
        message: `Started test run (\`${result.runId.slice(0, 8)}…\`). Open **Test execution** for live output.`,
        intent,
        actions: [
          { type: "navigate", tab: "test-execution" },
          { type: "highlight_run", runId: result.runId },
        ],
      };
    }

    case "stop": {
      const running = await prisma.testRun.findFirst({
        where: { projectId, status: "running", finishedAt: null },
        select: { id: true, output: true },
      });
      if (running === null) {
        return { message: "No test run is in progress.", intent };
      }
      cancelActiveTestRun(running.id);
      await prisma.testRun.update({
        where: { id: running.id },
        data: {
          output: `${running.output}\n[Stop requested from project assistant]\n`,
        },
      });
      return {
        message: "Stopping test run…",
        intent,
        actions: [{ type: "navigate", tab: "test-execution" }],
      };
    }

    case "rerun_failures": {
      const result = await startRerunFailuresForProject(projectId);
      if (!result.ok) {
        return { message: result.error, intent };
      }
      return {
        message: `Rerunning failures (\`${result.runId.slice(0, 8)}…\`).`,
        intent,
        actions: [
          { type: "navigate", tab: "test-execution" },
          { type: "highlight_run", runId: result.runId },
        ],
      };
    }

    case "navigate": {
      const tab = parseNavigateTab(rawMessage);
      return {
        message: `Opening **${tab.replace(/-/g, " ")}** tab.`,
        intent,
        actions: [{ type: "navigate", tab }],
      };
    }

    default:
      return { message: "", intent: "unknown" };
  }
}
