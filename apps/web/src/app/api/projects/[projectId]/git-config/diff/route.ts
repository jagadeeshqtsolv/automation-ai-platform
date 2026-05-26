import { NextResponse } from "next/server";
import { z } from "zod";
import { execFile as _execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectFrameworkRoot, getProjectUserGitDir, resolveFrameworkFilePath } from "@/lib/local-framework/paths";
import { prisma } from "@/lib/prisma";

const execFile = promisify(_execFile);
const paramsSchema = z.object({ projectId: z.string().uuid() });

async function git(root: string, args: string[], gitDir?: string) {
  const fullArgs = gitDir
    ? ["--git-dir", gitDir, "--work-tree", root, ...args]
    : args;
  return execFile("git", fullArgs, {
    cwd: root,
    timeout: 15_000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
}

export async function GET(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const filePath = new URL(req.url).searchParams.get("path");
  if (!filePath) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const project = await prisma.project.findUnique({
    where: { id: params.data.projectId },
    select: { platformType: true },
  });
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const platformType = project.platformType as "web" | "mobile";

  // Use allowlist-based path validator — rejects traversal and paths outside permitted prefixes
  const resolvedPath = resolveFrameworkFilePath(params.data.projectId, filePath, platformType);
  if (resolvedPath === null) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const root = getProjectFrameworkRoot(params.data.projectId, platformType);
  if (!existsSync(root)) return NextResponse.json({ error: "Project directory not found" }, { status: 404 });

  const userGitDir = getProjectUserGitDir(
    params.data.projectId,
    project.platformType as "web" | "mobile",
    guard.user.id,
  );
  // Require HEAD to confirm git init has run (user-file-tracker may create the dir without init)
  const gitDir =
    existsSync(userGitDir) && existsSync(join(userGitDir, "HEAD")) ? userGitDir : undefined;

  // Get XY status for this specific file
  let xy = "  ";
  try {
    const { stdout } = await git(root, ["status", "--porcelain", "--", filePath], gitDir);
    xy = stdout.slice(0, 2);
  } catch { /* proceed with empty xy */ }

  const isUntracked = xy === "??" || xy.trim() === "?";
  const isDeleted = xy.includes("D");
  const isStagedNew = xy[0] === "A";

  let diff = "";

  if (isUntracked) {
    // New untracked file — show full content prefixed with +
    try {
      const content = await readFile(resolvedPath, "utf-8");
      diff = content
        .split("\n")
        .map((l) => `+${l}`)
        .join("\n");
    } catch {
      diff = "(binary or unreadable file)";
    }
  } else if (isDeleted) {
    // Deleted file — show what was there
    try {
      const { stdout } = await git(root, ["show", `HEAD:${filePath}`], gitDir);
      diff = stdout
        .split("\n")
        .map((l) => `-${l}`)
        .join("\n");
    } catch {
      diff = "(could not retrieve deleted file content)";
    }
  } else if (isStagedNew) {
    // Staged new file
    try {
      const { stdout } = await git(root, ["diff", "--cached", "--", filePath], gitDir);
      diff = stdout;
    } catch { /* empty */ }
  } else {
    // Modified: try unstaged diff first, then staged
    try {
      const { stdout } = await git(root, ["diff", "HEAD", "--", filePath], gitDir);
      diff = stdout;
    } catch { /* empty */ }

    if (!diff) {
      try {
        const { stdout } = await git(root, ["diff", "--cached", "--", filePath], gitDir);
        diff = stdout;
      } catch { /* empty */ }
    }
  }

  return NextResponse.json({ diff: diff.trim(), isNew: isUntracked, isDeleted });
}
