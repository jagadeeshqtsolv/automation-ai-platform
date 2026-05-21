import { spawn } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getProjectFrameworkRoot, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { installFrameworkDependencies } from "@/lib/local-framework/install-dependencies";
import { buildMobilewrightConfig, ensureFrameworkScaffold } from "@/lib/local-framework/scaffold";

const bodySchema = z.object({
  projectId: z.string().uuid(),
  environmentId: z.string().uuid().optional(),
  platform: z.enum(["ios", "android"]).optional(),
  bundleId: z.string().min(1).max(240).optional(),
  deviceName: z.string().min(1).max(120).optional(),
  /** Matches environment config timeouts (e.g. 300000 ms for slow emulators). */
  timeout: z.number().int().min(5_000).max(300_000).optional(),
});

type CaptureOverrides = {
  platform?: "ios" | "android";
  bundleId?: string;
  deviceName?: string;
  timeout?: number;
};

function mergeConfig(base: string | null, overrides: CaptureOverrides): string {
  let obj: Record<string, unknown> = {};
  if (base !== null) {
    try {
      const parsed = JSON.parse(base) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        obj = parsed as Record<string, unknown>;
      }
    } catch {
      obj = {};
    }
  }

  if (overrides.platform !== undefined) obj.platform = overrides.platform;
  if (overrides.bundleId !== undefined) obj.bundleId = overrides.bundleId;
  if (overrides.deviceName !== undefined) obj.deviceName = overrides.deviceName;
  if (overrides.timeout !== undefined) obj.timeout = overrides.timeout;
  return JSON.stringify(obj);
}

async function runCaptureScript(projectId: string): Promise<void> {
  const root = getProjectFrameworkRoot(projectId);
  const install = await installFrameworkDependencies(projectId);
  if (!install.ok) {
    throw new Error(install.error ?? "npm install failed for framework dependencies");
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn("node", ["scripts/capture-view-tree.mjs"], { cwd: root, stdio: "pipe" });
    let stderr = "";
    let done = false;
    const killTimer = setTimeout(() => {
      if (!done) child.kill("SIGTERM");
    }, 330_000);

    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr += chunk.toString();
      if (stderr.length > 8_000) {
        stderr = stderr.slice(-8_000);
      }
    });
    child.once("error", (err) => {
      done = true;
      clearTimeout(killTimer);
      reject(err);
    });
    child.once("exit", (code) => {
      done = true;
      clearTimeout(killTimer);
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `capture script exited with code ${String(code)}`));
    });
  });
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

  const mergedConfig = mergeConfig(envConfig, {
    platform: parsed.data.platform,
    bundleId: parsed.data.bundleId?.trim() || undefined,
    deviceName: parsed.data.deviceName?.trim() || undefined,
    timeout: parsed.data.timeout,
  });

  try {
    await ensureFrameworkScaffold({
      projectId: project.id,
      projectName: project.name,
      environmentConfigJson: mergedConfig,
    });
    const cfgPath = resolveFrameworkFilePath(project.id, "mobilewright.config.ts");
    if (cfgPath !== null) {
      await writeFile(cfgPath, buildMobilewrightConfig(mergedConfig), "utf8");
    }

    await runCaptureScript(project.id);
    const outputPath = resolveFrameworkFilePath(project.id, "environments/latest-view-tree.json");
    if (outputPath === null) {
      throw new Error("Could not resolve output file path");
    }
    const viewTreeJson = await readFile(outputPath, "utf8");
    return NextResponse.json({ viewTreeJson });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not capture view tree";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
