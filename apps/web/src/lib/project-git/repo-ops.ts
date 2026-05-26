import { execFile as _execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { getProjectFrameworkRoot, getProjectUserGitDir } from "@/lib/local-framework/paths";
import { getUserOwnedPaths, getLastWrittenByMap } from "@/lib/local-framework/user-file-tracker";
import type { ProjectPlatformType } from "@automation-ai/core";

const execFile = promisify(_execFile);

const GIT_TIMEOUT_MS = 30_000;

/**
 * Build a "Create pull request" URL from a plain remote URL, working branch, and base branch.
 * Returns null if the host is not a known provider.
 */
export function buildPrUrl(remoteUrl: string, branch: string, baseBranch: string): string | null {
  try {
    const url = new URL(remoteUrl);
    const pathClean = url.pathname.replace(/\.git$/, "");

    if (url.hostname === "github.com") {
      return `https://github.com${pathClean}/compare/${baseBranch}...${branch}`;
    }
    if (url.hostname.includes("gitlab")) {
      return `https://${url.hostname}${pathClean}/-/merge_requests/new?merge_request[source_branch]=${branch}&merge_request[target_branch]=${baseBranch}`;
    }
    if (url.hostname.includes("bitbucket")) {
      return `https://${url.hostname}${pathClean}/pull-requests/new?source=${branch}&dest=${baseBranch}`;
    }
    return null;
  } catch {
    return null;
  }
}

/** Build an authenticated HTTPS remote URL by injecting the token before the host. */
function buildAuthUrl(remoteUrl: string, token: string): string {
  const url = new URL(remoteUrl);
  url.username = "oauth2";
  url.password = token;
  return url.toString();
}

/**
 * Run a git command inside the per-user git dir (or shared .git if no gitDir given).
 */
async function git(
  cwd: string,
  args: string[],
  env?: Record<string, string>,
  gitDir?: string,
): Promise<{ stdout: string; stderr: string }> {
  const fullArgs = gitDir
    ? ["--git-dir", gitDir, "--work-tree", cwd, ...args]
    : args;
  return execFile("git", fullArgs, {
    cwd,
    timeout: GIT_TIMEOUT_MS,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      ...env,
    },
  });
}

export type RepoStatus = {
  initialized: boolean;
  hasRemote: boolean;
  pendingFiles: number;
};

export type ChangedFile = {
  /** XY status codes from git status --porcelain (e.g. "M ", " M", "??", "A ") */
  status: string;
  /** File path relative to the framework root */
  path: string;
  /** Human-readable label */
  label: "modified" | "added" | "deleted" | "untracked" | "renamed" | "other";
};

export async function listChangedFiles(
  projectId: string,
  platformType: ProjectPlatformType,
  userId: string,
): Promise<ChangedFile[]> {
  const root = getProjectFrameworkRoot(projectId, platformType);
  const gitDir = getProjectUserGitDir(projectId, platformType, userId);

  // A directory created by owned-files tracking (mkdir only) is not a valid git dir.
  // Require HEAD to confirm git init has actually run.
  const hasValidGitDir = existsSync(gitDir) && existsSync(path.join(gitDir, "HEAD"));
  if (!hasValidGitDir && !existsSync(`${root}/.git`)) return [];

  const resolvedGitDir = hasValidGitDir ? gitDir : undefined;

  try {
    const { stdout } = await git(root, ["status", "--porcelain", "-u"], undefined, resolvedGitDir);
    const [ownedPaths, lastWrittenBy] = await Promise.all([
      getUserOwnedPaths(projectId, platformType, userId),
      getLastWrittenByMap(projectId, platformType),
    ]);

    return stdout
      .split("\n")
      .filter(Boolean)
      .filter((line) => {
        const filePath = line.slice(3).trim();
        return !filePath.startsWith("node_modules/") && !filePath.includes("/node_modules/");
      })
      .filter((line) => {
        const xy = line.slice(0, 2);
        const filePath = line.slice(3).trim();

        if (xy === "??") {
          // Untracked: only show files this user generated.
          return ownedPaths.has(filePath);
        }

        // Tracked change (M/A/D/R): show if:
        // 1. This user was the last to write it, OR
        // 2. No one in the last-writer map owns it (manual edit / shared config file).
        const lastWriter = lastWrittenBy[filePath];
        if (lastWriter === undefined) return true;   // unowned — always show
        return lastWriter === userId;                 // owned — only show to last writer
      })
      .map((line) => {
        const xy = line.slice(0, 2);
        const filePath = line.slice(3).trim();
        let label: ChangedFile["label"] = "other";
        if (xy === "??" ) label = "untracked";
        else if (xy.startsWith("A") || xy === " A") label = "added";
        else if (xy.startsWith("D") || xy === " D") label = "deleted";
        else if (xy.startsWith("R")) label = "renamed";
        else if (xy.includes("M")) label = "modified";
        return { status: xy, path: filePath, label };
      });
  } catch {
    return [];
  }
}

export async function getRepoStatus(
  projectId: string,
  platformType: ProjectPlatformType,
  userId: string,
): Promise<RepoStatus> {
  const root = getProjectFrameworkRoot(projectId, platformType);

  if (!existsSync(root)) {
    return { initialized: false, hasRemote: false, pendingFiles: 0 };
  }

  const gitDir = getProjectUserGitDir(projectId, platformType, userId);
  const hasUserGitDir = existsSync(gitDir) && existsSync(path.join(gitDir, "HEAD"));

  const legacyGitDir = `${root}/.git`;
  const hasLegacyGit = existsSync(legacyGitDir);

  if (!hasUserGitDir && !hasLegacyGit) {
    return { initialized: false, hasRemote: false, pendingFiles: 0 };
  }

  const resolvedGitDir = hasUserGitDir ? gitDir : undefined;

  let hasRemote = false;
  try {
    const { stdout } = await git(root, ["remote", "get-url", "origin"], undefined, resolvedGitDir);
    hasRemote = stdout.trim().length > 0;
  } catch {
    hasRemote = false;
  }

  // Use the same filtered list as the push panel so the badge matches what the user actually sees.
  const files = await listChangedFiles(projectId, platformType, userId).catch(() => []);
  const pendingFiles = files.length;

  return { initialized: true, hasRemote, pendingFiles };
}

export async function fetchRemote(params: {
  projectId: string;
  platformType: ProjectPlatformType;
  remoteUrl: string;
  token: string;
  userId: string;
}): Promise<{ newCommits: boolean; output: string }> {
  const root = getProjectFrameworkRoot(params.projectId, params.platformType);
  const gitDir = getProjectUserGitDir(params.projectId, params.platformType, params.userId);

  const hasUserGitDir = existsSync(gitDir) && existsSync(path.join(gitDir, "HEAD"));
  const hasLegacyGit = existsSync(`${root}/.git`);

  // Auto-initialize a minimal git dir so fetch works on first use
  if (!hasUserGitDir && !hasLegacyGit) {
    if (!existsSync(root)) await mkdir(root, { recursive: true });
    await mkdir(gitDir, { recursive: true });
    await git(root, ["init"], undefined, gitDir);
    await git(root, ["config", "core.worktree", root], undefined, gitDir);
    await git(root, ["config", "merge.autoStash", "false"], undefined, gitDir);
  }

  const resolvedGitDir = existsSync(gitDir) && existsSync(path.join(gitDir, "HEAD")) ? gitDir : undefined;

  // Update remote URL with fresh token before fetching
  const authUrl = buildAuthUrl(params.remoteUrl, params.token);
  try {
    await git(root, ["remote", "set-url", "origin", authUrl], undefined, resolvedGitDir);
  } catch {
    await git(root, ["remote", "add", "origin", authUrl], undefined, resolvedGitDir);
  }

  const { stdout, stderr } = await git(root, ["fetch", "--prune", "origin"], undefined, resolvedGitDir);
  const output = (stdout + stderr).trim();
  const newCommits = output.length > 0;
  return { newCommits, output: output || "Already up to date." };
}

/** Remove a stale index.lock left by a crashed git process (safe no-op if absent). */
async function clearStaleLock(gitDir: string): Promise<void> {
  const lockFile = path.join(gitDir, "index.lock");
  if (existsSync(lockFile)) {
    await rm(lockFile, { force: true }).catch(() => {});
  }
}

/**
 * Ensure .gitignore in the work tree excludes the per-user git metadata dirs and node_modules.
 * Also removes .git-users/ from git tracking if it was accidentally committed before.
 */
async function ensureGitignore(root: string, gitDir: string): Promise<void> {
  const gitignorePath = path.join(root, ".gitignore");
  const required = [".git-users/", "node_modules/"];

  let existing = "";
  try { existing = await readFile(gitignorePath, "utf-8"); } catch { /* new file */ }

  const missing = required.filter((e) => !existing.includes(e));
  if (missing.length > 0) {
    const sep = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
    await writeFile(gitignorePath, existing + sep + missing.join("\n") + "\n");
  }

  // If .git-users/ was accidentally committed before, remove it from tracking so it
  // won't be re-staged. --ignore-unmatch makes this a no-op when not tracked.
  await git(
    root,
    ["rm", "-r", "--cached", "--ignore-unmatch", "--quiet", ".git-users/"],
    undefined,
    gitDir,
  ).catch(() => {});
}

/**
 * git checkout with an automatic force-retry when untracked files in the work tree
 * would be overwritten by the target branch. This is safe here because the work tree
 * is shared and those files already contain the correct content from the target branch.
 */
async function checkoutBranch(
  root: string,
  args: string[],
  gitDir: string,
): Promise<void> {
  try {
    await git(root, ["checkout", ...args], undefined, gitDir);
  } catch (err) {
    if (/untracked working tree files would be overwritten/i.test(getStderr(err))) {
      await git(root, ["checkout", "-f", ...args], undefined, gitDir);
    } else {
      throw err;
    }
  }
}

export async function initRepo(params: {
  projectId: string;
  platformType: ProjectPlatformType;
  remoteUrl: string;
  branch: string;
  /** Base branch to create the user branch from if it doesn't exist yet (e.g. "main") */
  baseBranch?: string;
  authorName: string;
  authorEmail: string;
  token: string;
  userId: string;
}): Promise<void> {
  const root = getProjectFrameworkRoot(params.projectId, params.platformType);
  const gitDir = getProjectUserGitDir(params.projectId, params.platformType, params.userId);

  if (!existsSync(root)) {
    await mkdir(root, { recursive: true });
  }

  // Check for HEAD, not just directory existence — user-file-tracker creates the dir
  // before git init runs, so existsSync(gitDir) alone is not a reliable signal.
  const isValidGitDir = existsSync(gitDir) && existsSync(path.join(gitDir, "HEAD"));
  if (!isValidGitDir) {
    await mkdir(gitDir, { recursive: true });
    await git(root, ["init"], undefined, gitDir);
    await git(root, ["config", "core.worktree", root], undefined, gitDir);
    await git(root, ["config", "merge.autoStash", "false"], undefined, gitDir);
  }

  // Clear any stale lock from a previous interrupted operation
  await clearStaleLock(gitDir);

  await git(root, ["config", "user.name", params.authorName], undefined, gitDir);
  await git(root, ["config", "user.email", params.authorEmail], undefined, gitDir);

  // Ensure .gitignore excludes .git-users/ so metadata is never committed
  await ensureGitignore(root, gitDir);

  // Set or update the remote
  const authUrl = buildAuthUrl(params.remoteUrl, params.token);
  try {
    await git(root, ["remote", "get-url", "origin"], undefined, gitDir);
    await git(root, ["remote", "set-url", "origin", authUrl], undefined, gitDir);
  } catch {
    await git(root, ["remote", "add", "origin", authUrl], undefined, gitDir);
  }

  // Fetch latest remote state so we can branch from origin/baseBranch.
  // Propagate auth/network errors so the caller gets useful feedback;
  // only stay silent when the remote is genuinely empty (no refs yet).
  try {
    await git(root, ["fetch", "origin", "--quiet"], undefined, gitDir);
  } catch (fetchErr) {
    const fetchStderr = getStderr(fetchErr);
    // Only surface clear auth / network failures. Ignore warnings and empty-repo
    // cases where git exits non-zero but stderr has no actionable error.
    if (/authentication failed|could not resolve host|repository not found|access denied|403|401/i.test(fetchStderr)) {
      const line = fetchStderr.split("\n")[0].replace(/^(fatal|error):\s*/i, "").trim();
      throw new Error(`Could not fetch from remote: ${line}`);
    }
  }

  // Determine which branch to check out
  const { stdout: currentBranchOut } = await git(
    root, ["branch", "--show-current"], undefined, gitDir,
  ).catch(() => ({ stdout: "" }));
  const currentBranch = currentBranchOut.trim();

  // If already on the right branch, check whether it has a commit (not orphan).
  // An orphan branch has no parent commit — git branch shows nothing and git status
  // reports every file as untracked. Always re-base it on origin/baseBranch.
  const { stdout: headHash } = await git(root, ["rev-parse", "HEAD"], undefined, gitDir)
    .catch(() => ({ stdout: "" }));
  const isOrphan = !headHash.trim();

  if (currentBranch !== params.branch || isOrphan) {
    if (isOrphan && params.baseBranch) {
      // Orphan branch: no parent commit yet. We can't use -b (branch "exists" in HEAD).
      // Use reset --hard to point the current branch at origin/baseBranch's commit,
      // which gives the member a clean slate with zero diff against main.
      const { stdout: baseRef } = await git(
        root, ["rev-parse", "--verify", `origin/${params.baseBranch}`], undefined, gitDir,
      ).catch(() => ({ stdout: "" }));
      if (!baseRef.trim()) {
        throw new Error(
          `Remote branch "${params.baseBranch}" not found. ` +
          `Ask the admin to push the base structure to "${params.baseBranch}" first.`,
        );
      }
      if (currentBranch !== params.branch) {
        // Also need to switch to the target branch name first.
        // Since we're orphan, rename the current unborn branch via HEAD directly.
        await git(root, ["symbolic-ref", "HEAD", `refs/heads/${params.branch}`], undefined, gitDir);
      }
      await git(root, ["reset", "--hard", `origin/${params.baseBranch}`], undefined, gitDir);
    } else if (isOrphan) {
      // Fresh empty repo (admin first-time init): just ensure the branch name is correct.
      // We cannot `checkout -b` because git sees the unborn branch as already existing.
      // commitAndPush will make the first commit — no checkout or reset needed here.
      if (currentBranch !== params.branch) {
        await git(root, ["symbolic-ref", "HEAD", `refs/heads/${params.branch}`], undefined, gitDir);
      }
    } else {
      // Check if the user's branch already exists locally
      const { stdout: localList } = await git(
        root, ["branch", "--list", params.branch], undefined, gitDir,
      ).catch(() => ({ stdout: "" }));
      const localExists = localList.trim().length > 0;

      // Check if the user's branch exists on the remote
      const { stdout: remoteRef } = await git(
        root, ["rev-parse", "--verify", `origin/${params.branch}`], undefined, gitDir,
      ).catch(() => ({ stdout: "" }));
      const remoteExists = remoteRef.trim().length > 0;

      if (localExists || remoteExists) {
        await checkoutBranch(root, [params.branch], gitDir);
        // Sync with origin/baseBranch if it has moved ahead since this branch was created.
        if (params.baseBranch) {
          const { stdout: baseRef2 } = await git(
            root, ["rev-parse", "--verify", `origin/${params.baseBranch}`], undefined, gitDir,
          ).catch(() => ({ stdout: "" }));
          if (baseRef2.trim()) {
            const { stdout: countOut } = await git(
              root,
              ["rev-list", "--left-right", "--count", `origin/${params.baseBranch}...HEAD`],
              undefined,
              gitDir,
            ).catch(() => ({ stdout: "0\t0" }));
            const [behindStr, aheadStr] = countOut.trim().split("\t");
            const behind = parseInt(behindStr ?? "0", 10);
            const ahead = parseInt(aheadStr ?? "0", 10);
            if (behind > 0) {
              // Stash uncommitted working-tree changes (including untracked) so they survive
              // the rebase/fast-forward and land on top of the updated base.
              const { stdout: stashOut } = await git(
                root,
                ["stash", "push", "--include-untracked", "-m", "pre-sync-stash"],
                undefined,
                gitDir,
              ).catch(() => ({ stdout: "" }));
              const didStash = !stashOut.trim().startsWith("No local changes");
              try {
                if (ahead === 0) {
                  // Fast-forward: no local commits, just move HEAD to origin/baseBranch.
                  await git(root, ["reset", "--hard", `origin/${params.baseBranch}`], undefined, gitDir);
                } else {
                  // Diverged: rebase local commits on top of latest origin/baseBranch.
                  try {
                    await git(root, ["rebase", `origin/${params.baseBranch}`], undefined, gitDir);
                  } catch {
                    await git(root, ["rebase", "--abort"], undefined, gitDir).catch(() => {});
                  }
                }
              } finally {
                if (didStash) {
                  await git(root, ["stash", "pop"], undefined, gitDir).catch(() => {});
                }
              }
            }
          }
        }
      } else if (params.baseBranch) {
        // New branch — create from remote base branch so diff is zero against main
        const { stdout: baseRef } = await git(
          root, ["rev-parse", "--verify", `origin/${params.baseBranch}`], undefined, gitDir,
        ).catch(() => ({ stdout: "" }));
        if (baseRef.trim().length > 0) {
          await checkoutBranch(root, ["-b", params.branch, `origin/${params.baseBranch}`], gitDir);
        } else {
          throw new Error(
            `Remote branch "${params.baseBranch}" not found. ` +
            `Ask the admin to push the base structure to "${params.baseBranch}" first.`,
          );
        }
      } else {
        await checkoutBranch(root, ["-b", params.branch], gitDir);
      }
    }
  }

  // Confirm the branch has at least one commit when a baseBranch was expected.
  // For admin first-push (no baseBranch), the orphan state is intentional — commitAndPush follows.
  if (params.baseBranch) {
    const { stdout: headOut } = await git(root, ["rev-parse", "HEAD"], undefined, gitDir)
      .catch(() => ({ stdout: "" }));
    if (!headOut.trim()) {
      throw new Error(
        `Branch "${params.branch}" was created but has no commits. ` +
        `Ask the admin to push to "${params.baseBranch}" first, then re-save your settings.`,
      );
    }
  }
}

function getStderr(err: unknown): string {
  return err instanceof Error && "stderr" in err
    ? String((err as { stderr: unknown }).stderr)
    : "";
}

function isNonFastForward(err: unknown): boolean {
  const s = getStderr(err);
  if (s.includes("does not match any")) return false;
  return (
    s.includes("non-fast-forward") ||
    s.includes("[rejected]") ||
    s.includes("failed to push")
  );
}

export async function commitAndPush(params: {
  projectId: string;
  platformType: ProjectPlatformType;
  remoteUrl: string;
  branch: string;
  /** Base branch used when auto-initializing the user repo for the first time */
  baseBranch?: string;
  authorName: string;
  authorEmail: string;
  token: string;
  userId: string;
  /** If provided, only stage these paths instead of `git add .` */
  files?: string[];
  message?: string;
  /**
   * When true (push-to-base), fetch + merge with --allow-unrelated-histories before pushing.
   * Needed when the remote already has an unrelated initial commit (e.g. GitHub README).
   */
  allowUnrelatedHistories?: boolean;
}): Promise<{ committed: boolean; pushed: boolean; pulled: boolean; summary: string }> {
  const root = getProjectFrameworkRoot(params.projectId, params.platformType);
  const gitDir = getProjectUserGitDir(params.projectId, params.platformType, params.userId);

  // A directory alone is not a valid repo — git init writes HEAD. Without HEAD the dir was
  // created only for user-file tracking and has never been initialised.
  const hasUserGitDir = existsSync(gitDir) && existsSync(path.join(gitDir, "HEAD"));
  const hasLegacyGit = existsSync(`${root}/.git`);

  // Auto-initialize the per-user git dir on first push — no manual "Initialise" step needed.
  if (!hasUserGitDir && !hasLegacyGit) {
    await initRepo({
      projectId: params.projectId,
      platformType: params.platformType,
      remoteUrl: params.remoteUrl,
      branch: params.branch,
      baseBranch: params.baseBranch,
      authorName: params.authorName,
      authorEmail: params.authorEmail,
      token: params.token,
      userId: params.userId,
    });
  }

  // Re-check after potential initRepo so resolvedGitDir always points to a valid repo.
  const resolvedGitDir = existsSync(path.join(gitDir, "HEAD")) ? gitDir : undefined;

  // Clear any stale lock file left by a previously interrupted operation
  if (resolvedGitDir) await clearStaleLock(resolvedGitDir);

  await git(root, ["config", "user.name", params.authorName], undefined, resolvedGitDir);
  await git(root, ["config", "user.email", params.authorEmail], undefined, resolvedGitDir);

  // Always refresh the remote URL with a live token
  const authUrl = buildAuthUrl(params.remoteUrl, params.token);
  try {
    await git(root, ["remote", "set-url", "origin", authUrl], undefined, resolvedGitDir);
  } catch {
    await git(root, ["remote", "add", "origin", authUrl], undefined, resolvedGitDir);
  }

  if (params.files && params.files.length > 0) {
    await git(root, ["add", "--", ...params.files], undefined, resolvedGitDir);
  } else {
    await git(root, ["add", "."], undefined, resolvedGitDir);
  }

  // Commit staged changes
  const { stdout: statusOut } = await git(root, ["status", "--porcelain"], undefined, resolvedGitDir);
  const committed = statusOut.trim().length > 0;
  let summary = "";

  if (committed) {
    const message = params.message ?? `chore: sync test framework [${new Date().toISOString()}]`;
    const { stdout } = await git(root, ["commit", "-m", message], undefined, resolvedGitDir);
    summary = stdout.trim();
  }

  let pulled = false;

  if (params.allowUnrelatedHistories) {
    // For admin push-to-base: remote may have an unrelated initial commit (GitHub README etc).
    try { await git(root, ["merge", "--abort"], undefined, resolvedGitDir); } catch { /* none in progress */ }
    try { await git(root, ["rebase", "--abort"], undefined, resolvedGitDir); } catch { /* none in progress */ }

    await git(root, ["add", "."], undefined, resolvedGitDir);
    const { stdout: preMerge } = await git(root, ["status", "--porcelain"], undefined, resolvedGitDir);
    if (preMerge.trim().length > 0) {
      await git(root, ["commit", "-m", params.message ?? `chore: sync test framework [${new Date().toISOString()}]`], undefined, resolvedGitDir);
    }

    await git(root, ["fetch", "origin"], undefined, resolvedGitDir);

    let remoteBranchExists = false;
    try {
      await git(root, ["rev-parse", "--verify", `origin/${params.branch}`], undefined, resolvedGitDir);
      remoteBranchExists = true;
    } catch { /* branch doesn't exist yet */ }

    if (remoteBranchExists) {
      await git(root, [
        "merge",
        "--allow-unrelated-histories",
        "--no-edit",
        "-X", "ours",
        `origin/${params.branch}`,
      ], undefined, resolvedGitDir);
      pulled = true;
    }

    await git(root, ["push", "--set-upstream", "origin", params.branch], undefined, resolvedGitDir);
  } else {
    // Normal user push: try once, on non-fast-forward stash → rebase → pop → retry.
    try {
      await git(root, ["push", "--set-upstream", "origin", params.branch], undefined, resolvedGitDir);
    } catch (firstErr) {
      if (!isNonFastForward(firstErr)) throw firstErr;

      // Check whether the remote branch actually exists before attempting a rebase.
      // If the branch is brand-new on the remote side there is nothing to rebase against
      // and `git pull --rebase origin <branch>` would fail with
      // "fatal: couldn't find remote ref <branch>".
      const { stdout: remoteRef } = await git(
        root,
        ["ls-remote", "--heads", "origin", params.branch],
        undefined,
        resolvedGitDir,
      ).catch(() => ({ stdout: "" }));
      const remoteExists = remoteRef.trim().length > 0;

      if (remoteExists) {
        // Stash unstaged/untracked changes so they don't block the rebase.
        // Only files the user selected were committed above; everything else
        // in the shared work tree is still unstaged and would cause:
        // "cannot pull with rebase: You have unstaged changes."
        const { stdout: stashOut } = await git(
          root,
          ["stash", "push", "--include-untracked", "-m", "pre-push-rebase"],
          undefined,
          resolvedGitDir,
        ).catch(() => ({ stdout: "No local changes" }));
        const didStash = !stashOut.trim().startsWith("No local changes");

        try {
          await git(root, ["pull", "--rebase", "origin", params.branch], undefined, resolvedGitDir);
          pulled = true;
        } finally {
          if (didStash) {
            await git(root, ["stash", "pop"], undefined, resolvedGitDir).catch(() => {});
          }
        }
      }

      await git(root, ["push", "--set-upstream", "origin", params.branch], undefined, resolvedGitDir);
    }
  }

  return { committed, pushed: true, pulled, summary };
}
