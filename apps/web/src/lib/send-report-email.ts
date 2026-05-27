import nodemailer from "nodemailer";
import type { TestRunResultsAnalysis, TestCaseResultAnalysis } from "@/lib/test-execution/playwright-report-analysis";

export type ReportEmailParams = {
  to: string;              // comma-separated addresses
  status: "passed" | "failed" | "error";
  projectName: string;
  runId: string;
  pipelineUrl: string | null;
  appUrl: string;          // base URL of the platform
  projectId: string;
  analysis: TestRunResultsAnalysis | null;
};

// ── SMTP ─────────────────────────────────────────────────────────────────────

function isMailConfigured(): boolean {
  return (
    Boolean(process.env.MAIL_SERVER) &&
    Boolean(process.env.MAIL_USERNAME) &&
    Boolean(process.env.MAIL_PASSWORD)
  );
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.MAIL_SERVER,
    port: Number(process.env.MAIL_PORT ?? 587),
    secure: Number(process.env.MAIL_PORT ?? 587) === 465,
    auth: {
      user: process.env.MAIL_USERNAME,
      pass: process.env.MAIL_PASSWORD,
    },
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const m = Math.floor(ms / 60_000);
  const s = Math.round((ms % 60_000) / 1000);
  return `${m}m ${s}s`;
}

const STATUS_BG: Record<ReportEmailParams["status"], string> = {
  passed: "#14532d",
  failed: "#450a0a",
  error:  "#431407",
};
const STATUS_BORDER: Record<ReportEmailParams["status"], string> = {
  passed: "#22c55e",
  failed: "#ef4444",
  error:  "#f97316",
};
const STATUS_LABEL: Record<ReportEmailParams["status"], string> = {
  passed: "✓ PASSED",
  failed: "✗ FAILED",
  error:  "⚠ ERROR",
};

const CASE_STATUS_ICON: Record<TestCaseResultAnalysis["status"], string> = {
  passed:  "✓",
  failed:  "✗",
  flaky:   "~",
  skipped: "–",
};
const CASE_STATUS_COLOR: Record<TestCaseResultAnalysis["status"], string> = {
  passed:  "#22c55e",
  failed:  "#ef4444",
  flaky:   "#f59e0b",
  skipped: "#71717a",
};

// ── Report stats section ──────────────────────────────────────────────────────

function renderStats(analysis: TestRunResultsAnalysis): string {
  const { stats } = analysis;
  const total = stats.expected + stats.unexpected + stats.flaky + stats.skipped;
  const passRate = total > 0 ? Math.round((stats.expected / total) * 100) : 0;
  const barColor = stats.unexpected > 0 ? "#ef4444" : "#22c55e";
  const duration = stats.durationMs !== undefined ? fmtDuration(stats.durationMs) : null;

  const cells = [
    { label: "Passed",  value: stats.expected,   color: "#22c55e" },
    { label: "Failed",  value: stats.unexpected, color: "#ef4444" },
    { label: "Flaky",   value: stats.flaky,      color: "#f59e0b" },
    { label: "Skipped", value: stats.skipped,    color: "#71717a" },
  ]
    .filter((c) => c.value > 0)
    .map(
      (c) => `
      <td style="text-align:center;padding:10px 16px;background:#1c1c1e;border-radius:8px;min-width:60px">
        <div style="font-size:22px;font-weight:700;color:${c.color}">${c.value}</div>
        <div style="font-size:11px;color:#a1a1aa;margin-top:2px">${c.label}</div>
      </td>`,
    )
    .join('<td style="width:8px"></td>');

  const durationCell = duration
    ? `<div style="margin-top:10px;font-size:12px;color:#71717a">⏱ Duration: ${duration}</div>`
    : "";

  return `
  <!-- Stats -->
  <table cellpadding="0" cellspacing="0" style="width:100%;margin-bottom:4px">
    <tr>${cells}</tr>
  </table>
  <!-- Pass rate bar -->
  <div style="margin-top:12px">
    <div style="display:flex;justify-content:space-between;margin-bottom:4px">
      <span style="font-size:11px;color:#a1a1aa">Pass rate</span>
      <span style="font-size:11px;color:${barColor};font-weight:600">${passRate}%</span>
    </div>
    <div style="background:#27272a;border-radius:999px;height:8px;overflow:hidden">
      <div style="background:${barColor};height:8px;width:${passRate}%;border-radius:999px"></div>
    </div>
  </div>
  ${durationCell}`;
}

// ── Test cases table ──────────────────────────────────────────────────────────

const MAX_CASES_IN_EMAIL = 30;
const MAX_FAILED_IN_EMAIL = 10;

function renderCasesTable(cases: TestCaseResultAnalysis[]): string {
  // Show all failed/flaky first, then passed (capped)
  const failed  = cases.filter((c) => c.status === "failed" || c.status === "flaky");
  const passed  = cases.filter((c) => c.status === "passed");
  const skipped = cases.filter((c) => c.status === "skipped");

  const shownFailed  = failed.slice(0, MAX_FAILED_IN_EMAIL);
  const remaining    = MAX_CASES_IN_EMAIL - shownFailed.length;
  const shownPassed  = passed.slice(0, Math.max(0, remaining - skipped.length));
  const shownSkipped = skipped.slice(0, Math.max(0, remaining - shownPassed.length));

  const shown = [...shownFailed, ...shownPassed, ...shownSkipped];
  const hiddenCount = cases.length - shown.length;

  const rows = shown
    .map((c) => {
      const icon  = CASE_STATUS_ICON[c.status];
      const color = CASE_STATUS_COLOR[c.status];
      const dur   = fmtDuration(c.durationMs);
      const file  = c.file ? `<div style="font-size:10px;color:#52525b;margin-top:2px">${esc(c.file)}</div>` : "";
      const err   = c.errorSnippet
        ? `<div style="margin-top:4px;padding:6px 8px;background:#1c1c1e;border-left:3px solid #ef4444;border-radius:4px;font-family:monospace;font-size:10px;color:#fca5a5;word-break:break-word">${esc(c.errorSnippet)}</div>`
        : "";
      return `
      <tr style="border-bottom:1px solid #27272a">
        <td style="padding:8px 10px;width:24px;text-align:center;font-size:14px;color:${color};font-weight:700">${icon}</td>
        <td style="padding:8px 10px">
          <div style="font-size:12px;color:#e4e4e7">${esc(c.title)}</div>
          ${file}
          ${err}
        </td>
        <td style="padding:8px 10px;font-size:11px;color:#71717a;white-space:nowrap;text-align:right">${dur}</td>
      </tr>`;
    })
    .join("");

  const moreRow =
    hiddenCount > 0
      ? `<tr><td colspan="3" style="padding:8px 10px;font-size:11px;color:#71717a;text-align:center">
           … and ${hiddenCount} more test${hiddenCount === 1 ? "" : "s"} — view the full report for details
         </td></tr>`
      : "";

  return `
  <!-- Test cases -->
  <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin-top:16px;background:#111113;border-radius:8px;overflow:hidden;border:1px solid #27272a">
    <thead>
      <tr style="background:#1c1c1e">
        <th style="padding:8px 10px;font-size:11px;color:#71717a;font-weight:600;text-align:left" colspan="2">Test</th>
        <th style="padding:8px 10px;font-size:11px;color:#71717a;font-weight:600;text-align:right">Duration</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      ${moreRow}
    </tbody>
  </table>`;
}

// ── Full HTML email ───────────────────────────────────────────────────────────

function buildHtml(params: ReportEmailParams): string {
  const { status, projectName, runId, pipelineUrl, appUrl, projectId, analysis } = params;

  const bg     = STATUS_BG[status];
  const border = STATUS_BORDER[status];
  const label  = STATUS_LABEL[status];

  const platformUrl = `${appUrl}/projects/${projectId}`;

  const statsSection  = analysis ? renderStats(analysis) : "";
  const casesSection  = analysis?.cases.length ? renderCasesTable(analysis.cases) : "";

  const pipelineBtn = pipelineUrl
    ? `<a href="${esc(pipelineUrl)}" style="display:inline-block;margin-right:8px;padding:8px 16px;background:#27272a;color:#e4e4e7;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600">View CI pipeline</a>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"/><meta name="viewport" content="width=device-width"/></head>
<body style="margin:0;padding:0;background:#09090b;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#e4e4e7">
<table cellpadding="0" cellspacing="0" style="width:100%;padding:32px 16px">
<tr><td>
<div style="max-width:600px;margin:0 auto">

  <!-- Header banner -->
  <div style="background:${bg};border:1px solid ${border};border-radius:12px;padding:20px 24px;margin-bottom:16px">
    <div style="font-size:22px;font-weight:800;color:${border};letter-spacing:-0.5px">${label}</div>
    <div style="font-size:14px;color:#d4d4d8;margin-top:4px">
      <strong style="color:#fff">${esc(projectName)}</strong> · run finished
    </div>
  </div>

  <!-- Stats card -->
  ${analysis ? `
  <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:20px 24px;margin-bottom:16px">
    <div style="font-size:13px;font-weight:600;color:#a1a1aa;margin-bottom:12px;text-transform:uppercase;letter-spacing:0.5px">Results</div>
    ${statsSection}
    ${casesSection}
  </div>` : ""}

  <!-- Action buttons -->
  <div style="margin-bottom:16px">
    ${pipelineBtn}
    <a href="${esc(platformUrl)}" style="display:inline-block;padding:8px 16px;background:#27272a;color:#e4e4e7;text-decoration:none;border-radius:8px;font-size:13px;font-weight:600">Open project</a>
  </div>

  <!-- Meta -->
  <div style="background:#18181b;border:1px solid #27272a;border-radius:8px;padding:14px 18px;font-size:12px;color:#71717a">
    <div>Run ID: <span style="font-family:monospace;color:#a1a1aa">${esc(runId)}</span></div>
    ${pipelineUrl ? `<div style="margin-top:4px">Pipeline: <a href="${esc(pipelineUrl)}" style="color:#60a5fa">${esc(pipelineUrl)}</a></div>` : ""}
    <div style="margin-top:8px;padding-top:8px;border-top:1px solid #27272a">
      Sent by AutomationAI · You received this because report emails are configured for this project.
    </div>
  </div>

</div>
</td></tr>
</table>
</body>
</html>`;
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function sendReportEmail(params: ReportEmailParams): Promise<void> {
  if (!isMailConfigured()) {
    console.warn(
      "[report-email] SMTP not configured — skipping. Set MAIL_SERVER, MAIL_USERNAME, MAIL_PASSWORD in .env",
    );
    return;
  }

  const { to, status, projectName } = params;
  const html = buildHtml(params);

  const transport = createTransport();
  await transport.sendMail({
    from: process.env.MAIL_FROM ?? process.env.MAIL_USERNAME,
    to,
    subject: `AI Automation - ${projectName} - Report - [${status.toUpperCase()}]`,
    html,
  });

  console.log(`[report-email] Sent to ${to} (status: ${status})`);
}
