import { NextResponse } from "next/server";
import { z } from "zod";
import * as XLSX from "xlsx";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { prisma } from "@/lib/prisma";
import { testPlanSchema } from "@jagadeeshqtsolv/core";
import type { TestStep } from "@jagadeeshqtsolv/core";

const paramsSchema = z.object({ projectId: z.string().uuid() });

function stepDescription(step: TestStep): string {
  const t = step.targetDescription;
  const v = step.value ?? "";
  switch (step.action) {
    case "tap":
    case "doubleTap":
    case "longPress":
      return `${step.action === "doubleTap" ? "Double-click" : step.action === "longPress" ? "Long-press" : "Click"} "${t}"`;
    case "hover":
      return `Hover over "${t}"`;
    case "fill":
    case "typeText":
      return `${step.action === "typeText" ? "Type" : "Fill"} "${t}" with "${v}"`;
    case "clear":
      return `Clear "${t}"`;
    case "check":
      return `Check "${t}"`;
    case "uncheck":
      return `Uncheck "${t}"`;
    case "selectOption":
      return `Select option "${v}" in "${t}"`;
    case "scrollIntoView":
      return `Scroll "${t}" into view`;
    case "back":
      return "Navigate back";
    case "screenshot":
      return "Take a screenshot";
    case "wait":
      return v ? `Wait ${v}ms` : "Wait";
    case "openUrl":
    case "openDeepLink":
      return `Open URL: ${v || t}`;
    case "waitForVisible":
      return `Wait for "${t}" to be visible`;
    case "waitForHidden":
      return `Wait for "${t}" to be hidden`;
    case "switchToFrame":
      return `Switch to frame "${t}"`;
    case "switchToMainFrame":
      return "Switch to main frame";
    case "switchToNewTab":
      return "Switch to new tab";
    case "closeTab":
      return "Close current tab";
    case "launchApp":
      return "Launch app";
    case "terminateApp":
      return "Terminate app";
    case "setOrientation":
      return `Set orientation to "${v}"`;
    case "pressButton":
      return `Press "${v || t}"`;
    case "swipe":
      return `Swipe on "${t}"`;
    case "pullToRefresh":
      return `Pull to refresh on "${t}"`;
    case "gesture":
      return `Perform gesture on "${t}"`;
    case "tapAt":
      return `Tap at coordinates on "${t}"`;
    default:
      return t;
  }
}

function expectedResult(step: TestStep): string {
  switch (step.action) {
    case "assertVisible":
      return `"${step.targetDescription}" is visible`;
    case "assertHidden":
      return `"${step.targetDescription}" is not visible`;
    case "assertText":
      return `"${step.targetDescription}" shows text "${step.assertion ?? ""}"`;
    case "assertContainsText":
      return `"${step.targetDescription}" contains "${step.assertion ?? ""}"`;
    case "assertValue":
      return `"${step.targetDescription}" has value "${step.assertion ?? ""}"`;
    case "assertEnabled":
      return `"${step.targetDescription}" is enabled`;
    case "assertDisabled":
      return `"${step.targetDescription}" is disabled`;
    case "assertChecked":
      return `"${step.targetDescription}" is checked`;
    case "assertUnchecked":
      return `"${step.targetDescription}" is unchecked`;
    case "assertSelected":
      return `"${step.targetDescription}" is selected`;
    case "assertFocused":
      return `"${step.targetDescription}" is focused`;
    case "assertCount":
      return `"${step.targetDescription}" count is ${step.assertion ?? ""}`;
    case "assertCountGreaterThan":
      return `"${step.targetDescription}" count > ${step.assertion ?? ""}`;
    default:
      return "";
  }
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const params = await context.params;
  const parsed = paramsSchema.safeParse(params);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) return guard.error;

  const requirements = await prisma.requirement.findMany({
    where: { projectId: parsed.data.projectId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      title: true,
      testPlans: {
        orderBy: { createdAt: "asc" },
        select: { id: true, json: true },
      },
    },
  });

  const workbook = XLSX.utils.book_new();

  const HEADERS = [
    "Requirement",
    "Suite",
    "Test Case ID",
    "Test Case Title",
    "Priority",
    "Tags",
    "Platforms",
    "Preconditions",
    "Step #",
    "Step Description",
    "Expected Result",
  ];

  // Collect all rows across all requirements into one sheet
  const allRows: (string | number)[][] = [];

  // Per-suite sequential counters for TC IDs (e.g. CreateLead_001)
  const suiteCounters = new Map<string, number>();

  function suitePrefix(suiteName: string): string {
    return suiteName
      .replace(/[^a-zA-Z0-9 ]/g, " ")
      .split(" ")
      .filter((w) => w.length > 0)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join("");
  }

  function nextTcId(suiteName: string): string {
    const prefix = suitePrefix(suiteName);
    const count = (suiteCounters.get(prefix) ?? 0) + 1;
    suiteCounters.set(prefix, count);
    return `${prefix}_${String(count).padStart(3, "0")}`;
  }

  for (const req of requirements) {
    for (const planRow of req.testPlans) {
      let plan: ReturnType<typeof testPlanSchema.parse> | null = null;
      try {
        plan = testPlanSchema.parse(JSON.parse(planRow.json) as unknown);
      } catch {
        continue;
      }

      for (const tc of plan.cases) {
        const preconditions = tc.preconditions.length > 0
          ? tc.preconditions.join("; ")
          : "Login required; User should have access to the application";
        const tags = tc.tags.map((t) => t.replace(/^@/, "")).join(", ");
        const platforms = tc.platforms.join(", ");
        const tcId = nextTcId(req.title ?? plan.suiteName);

        if (tc.steps.length === 0) {
          allRows.push([
            req.title ?? "",
            plan.suiteName,
            tcId,
            tc.title,
            tc.priority,
            tags,
            platforms,
            preconditions,
            "",
            "",
            "",
          ]);
          continue;
        }

        tc.steps.forEach((step, idx) => {
          allRows.push([
            idx === 0 ? (req.title ?? "") : "",
            idx === 0 ? plan!.suiteName : "",
            idx === 0 ? tcId : "",
            idx === 0 ? tc.title : "",
            idx === 0 ? tc.priority : "",
            idx === 0 ? tags : "",
            idx === 0 ? platforms : "",
            idx === 0 ? preconditions : "",
            idx + 1,
            stepDescription(step),
            expectedResult(step),
          ]);
        });
      }
    }
  }

  const wsData = [HEADERS, ...allRows];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws["!cols"] = [
    { wch: 28 }, // Requirement
    { wch: 28 }, // Suite
    { wch: 30 }, // Test Case ID
    { wch: 42 }, // Test Case Title
    { wch: 8 },  // Priority
    { wch: 20 }, // Tags
    { wch: 20 }, // Platforms
    { wch: 52 }, // Preconditions
    { wch: 7 },  // Step #
    { wch: 52 }, // Step Description
    { wch: 44 }, // Expected Result
  ];

  XLSX.utils.book_append_sheet(workbook, ws, "Test Cases");

  const buf = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const bytes = new Uint8Array(buf);

  const filename = `test-cases-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new Response(bytes, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
