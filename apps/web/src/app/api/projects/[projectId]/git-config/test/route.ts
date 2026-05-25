import { NextResponse } from "next/server";
import { execFile as _execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectGitConfigView } from "@/lib/project-git/git-config";
import { getUserGitToken } from "@/lib/project-git/user-git-config";

const execFile = promisify(_execFile);

const paramsSchema = z.object({ projectId: z.string().uuid() });

const bodySchema = z.object({
  /** Plain token from the form — if omitted, the user's saved token is used */
  token: z.string().min(1).max(512).optional(),
});

function buildAuthUrl(remoteUrl: string, token: string): string {
  const url = new URL(remoteUrl);
  url.username = "oauth2";
  url.password = token;
  return url.toString();
}

export async function POST(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) return NextResponse.json({ error: "Invalid project id" }, { status: 400 });

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);

  const projectConfig = await getProjectGitConfigView(params.data.projectId);
  if (!projectConfig?.remoteUrl) {
    return NextResponse.json(
      { error: "Remote URL is not configured for this project. Ask your admin to set it first." },
      { status: 400 },
    );
  }

  const token =
    (parsed.success ? parsed.data.token : undefined) ??
    (await getUserGitToken(params.data.projectId, guard.user.id));

  if (!token) {
    return NextResponse.json(
      { error: "No access token provided and none saved in your Git settings." },
      { status: 400 },
    );
  }

  const authUrl = buildAuthUrl(projectConfig.remoteUrl, token);

  try {
    // Do NOT use --exit-code: an empty repo has no HEAD yet and would return exit code 2,
    // falsely reporting a connection failure. We only need to verify the remote is reachable.
    await execFile("git", ["ls-remote", authUrl], {
      timeout: 15_000,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });

    return NextResponse.json({ ok: true, message: "Connection successful — repository is accessible." });
  } catch (err) {
    const stderr =
      err instanceof Error && "stderr" in err
        ? String((err as NodeJS.ErrnoException & { stderr: string }).stderr)
        : "";

    let message = "Could not connect to the repository.";
    if (stderr.includes("Authentication failed") || stderr.includes("invalid credentials")) {
      message = "Authentication failed — check your personal access token.";
    } else if (stderr.includes("Repository not found") || stderr.includes("not found")) {
      message = "Repository not found — check the remote URL.";
    } else if (stderr.includes("Could not resolve host")) {
      message = "Could not reach the host — check the remote URL.";
    } else if (stderr.length > 0) {
      message = stderr.split("\n")[0].replace(/^(fatal|error):\s*/i, "").trim();
    }

    return NextResponse.json({ ok: false, message }, { status: 422 });
  }
}
