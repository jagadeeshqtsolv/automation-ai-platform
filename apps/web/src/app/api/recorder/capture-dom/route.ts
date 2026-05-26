import { writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectPlatformType } from "@/lib/project-platform";
import { parseWebEnvironmentConfig } from "@/lib/playwright-web-environment-config";
import { ensureWebFrameworkScaffold, writePlaywrightWebConfig } from "@/lib/local-framework/web-scaffold";
import { resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { parseViewTreeJson } from "@/lib/parse-view-tree-json";
import {
  captureWebRecorderDom,
  consumeRecorderEvents,
  isWebRecorderSessionRunning,
  startWebRecorderSession,
  stopWebRecorderSession,
} from "@/lib/recorder/web-recorder-session";

const bodySchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
  baseURL: z.string().min(4).max(500).optional(),
  startPath: z.string().max(500).optional(),
  browser: z.enum(["chromium", "firefox", "webkit"]).optional(),
  headless: z.boolean().optional(),
  /** start = open headed browser; capture = snapshot current page; stop = close browser; events = consume tab events */
  action: z.enum(["start", "capture", "stop", "status", "events"]).default("capture"),
});

function mergeWebSession(base: string | null, overrides: z.infer<typeof bodySchema>): string {
  const cfg = parseWebEnvironmentConfig(base);
  const session = {
    baseURL: overrides.baseURL ?? cfg.baseURL ?? "https://example.com",
    startPath: overrides.startPath ?? "/",
    browser: overrides.browser ?? cfg.browser ?? "chromium",
    headless: overrides.headless ?? false,
  };
  return JSON.stringify(session, null, 2);
}

async function prepareWebRecorder(
  projectId: string,
  projectName: string,
  envConfig: string | null,
  sessionJson: string,
): Promise<void> {
  await ensureWebFrameworkScaffold({
    projectId,
    projectName,
    environmentConfigJson: envConfig,
  });

  if (envConfig !== null) {
    await writePlaywrightWebConfig(projectId, envConfig);
  }

  const sessionPath = resolveFrameworkFilePath(projectId, "environments/.recorder-session.json", "web");
  if (sessionPath === null) {
    throw new Error("Could not resolve recorder session path");
  }
  await writeFile(sessionPath, sessionJson, "utf8");
}

export async function POST(req: Request) {
  const json: unknown = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? issue.path.join(".") : "body";
        return `${path}: ${issue.message}`;
      })
      .join("; ");
    return NextResponse.json({ error: detail || "Invalid request body" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsed.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const platform = await getProjectPlatformType(parsed.data.projectId);
  if (platform !== "web") {
    return NextResponse.json({ error: "DOM capture is only available for web projects" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: parsed.data.projectId },
    select: { id: true, name: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  let envConfig: string | null = null;
  if (parsed.data.environmentId !== undefined) {
    const env = await prisma.environment.findFirst({
      where: { id: parsed.data.environmentId, projectId: parsed.data.projectId },
      select: { configJson: true },
    });
    if (env === null) {
      return NextResponse.json({ error: "Environment not found for this project" }, { status: 404 });
    }
    envConfig = env.configJson;
  }

  const sessionJson = mergeWebSession(envConfig, parsed.data);

  try {
    if (parsed.data.action === "status") {
      const running = await isWebRecorderSessionRunning(parsed.data.projectId);
      return NextResponse.json({ running });
    }

    if (parsed.data.action === "events") {
      const events = await consumeRecorderEvents(parsed.data.projectId);
      return NextResponse.json({ events });
    }

    if (parsed.data.action === "stop") {
      await stopWebRecorderSession(parsed.data.projectId);
      return NextResponse.json({ running: false });
    }

    if (parsed.data.action === "start") {
      await prepareWebRecorder(project.id, project.name, envConfig, sessionJson);
      await startWebRecorderSession(project.id);
      return NextResponse.json({ running: true });
    }

    // capture
    await prepareWebRecorder(project.id, project.name, envConfig, sessionJson);
    const domSnapshotRaw = await captureWebRecorderDom(parsed.data.projectId);
    let domSnapshot: unknown;
    try {
      domSnapshot = parseViewTreeJson(domSnapshotRaw);
    } catch {
      return NextResponse.json(
        { error: "Captured DOM snapshot is not valid JSON. Try capturing again." },
        { status: 500 },
      );
    }
    return NextResponse.json({
      domSnapshot,
      domSnapshotJson: domSnapshotRaw,
      running: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not capture DOM";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
