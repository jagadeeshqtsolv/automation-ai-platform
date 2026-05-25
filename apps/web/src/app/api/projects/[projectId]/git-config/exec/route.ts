import { NextResponse } from "next/server";
import { z } from "zod";
import { execFile as _execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectFrameworkRoot, getProjectUserGitDir } from "@/lib/local-framework/paths";
import { prisma } from "@/lib/prisma";

const execFile = promisify(_execFile);

const paramsSchema = z.object({ projectId: z.string().uuid() });
const bodySchema = z.object({ command: z.string().min(1).max(500) });

const BLOCKED = new Set([
  "credential",
  "filter-branch",
  "fast-import",
  "fast-export",
]);

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const body = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) return NextResponse.json({ error: "Invalid request body" }, { status: 400 });

  // Strip leading "git " prefix if present
  const raw = body.data.command.trim();
  const stripped = raw.startsWith("git ") ? raw.slice(4).trim() : raw;
  const args = stripped.split(/\s+/).filter(Boolean);

  const subcommand = args[0]?.toLowerCase() ?? "";
  if (!subcommand) return NextResponse.json({ error: "Empty command" }, { status: 400 });

  if (BLOCKED.has(subcommand)) {
    return NextResponse.json(
      { stdout: "", stderr: `git ${subcommand}: not permitted`, exitCode: 1 },
    );
  }

  // Prevent global/system config mutations
  if (
    subcommand === "config" &&
    args.some((a) => a === "--global" || a === "--system" || a === "-e" || a === "--edit")
  ) {
    return NextResponse.json(
      { stdout: "", stderr: "git config --global / --system is not permitted", exitCode: 1 },
    );
  }

  const project = await prisma.project.findUnique({
    where: { id: params.data.projectId },
    select: { platformType: true },
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const root = getProjectFrameworkRoot(
    params.data.projectId,
    project.platformType as "web" | "mobile",
  );
  if (!existsSync(root)) {
    return NextResponse.json(
      { stdout: "", stderr: "Project directory does not exist — initialise the repo first.", exitCode: 1 },
    );
  }

  const userGitDir = getProjectUserGitDir(
    params.data.projectId,
    project.platformType as "web" | "mobile",
    guard.user.id,
  );
  // Use per-user git dir if it exists, otherwise fall back to shared .git
  const gitDirArgs = existsSync(userGitDir)
    ? ["--git-dir", userGitDir, "--work-tree", root]
    : [];

  try {
    const { stdout, stderr } = await execFile("git", [...gitDirArgs, ...args], {
      cwd: root,
      timeout: 30_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return NextResponse.json({ stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 });
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; code?: number };
    return NextResponse.json({
      stdout: (e.stdout ?? "").trim(),
      stderr: (e.stderr ?? "").trim(),
      exitCode: typeof e.code === "number" ? e.code : 1,
    });
  }
}
