import type { CiProvider } from "@automation-ai/core";

export type { CiProvider };

export type TriggerInputs = {
  spec_paths: string;
  environment: string;
  grep: string;
  callback_url: string;
  run_id: string;
};

export type TriggerParams = {
  remoteUrl: string;
  ciToken: string;
  workflowFile: string;
  branch: string;
  inputs: TriggerInputs;
};

export type TriggerResult = { ok: true } | { ok: false; error: string };

/**
 * Polls the GitHub Actions API to find the workflow run that was just dispatched.
 * Returns the run's HTML URL once found, or null if not found within the timeout.
 * Call this fire-and-forget after a successful workflow_dispatch.
 */
export async function findLatestGitHubRunUrl(params: {
  remoteUrl: string;
  ciToken: string;
  workflowFile: string;
  branch: string;
  /** Timestamp just before the dispatch call was made, used to filter stale runs. */
  triggeredAt: Date;
}): Promise<string | null> {
  const repo = parseGitHubRepo(params.remoteUrl);
  if (!repo) return null;

  const apiUrl =
    `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/workflows/` +
    `${encodeURIComponent(params.workflowFile)}/runs` +
    `?branch=${encodeURIComponent(params.branch)}&event=workflow_dispatch&per_page=5`;

  const res = await fetch(apiUrl, {
    headers: {
      Authorization: `Bearer ${params.ciToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!res.ok) return null;

  const data = (await res.json()) as {
    workflow_runs?: Array<{ html_url: string; created_at: string }>;
  };

  // Allow 90s of slack for clock skew between machines
  const cutoff = new Date(params.triggeredAt.getTime() - 90_000);
  const run = (data.workflow_runs ?? []).find(
    (r) => new Date(r.created_at) >= cutoff,
  );
  return run?.html_url ?? null;
}

export async function triggerCiPipeline(params: TriggerParams): Promise<TriggerResult> {
  const url = params.remoteUrl.toLowerCase();
  if (url.includes("github.com")) return triggerGitHub(params);
  if (url.includes("gitlab")) return triggerGitLab(params);
  if (url.includes("bitbucket.org")) return triggerBitbucket(params);
  return {
    ok: false,
    error:
      "Could not detect CI provider from repository URL. Supported: GitHub, GitLab, Bitbucket.",
  };
}

// ── GitHub Actions ────────────────────────────────────────────────────────────

function parseGitHubRepo(remoteUrl: string): { owner: string; repo: string } | null {
  const m = /github\.com[/:]([^/]+)\/([^/.]+)/i.exec(remoteUrl);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, "") };
}

async function triggerGitHub(params: TriggerParams): Promise<TriggerResult> {
  const repo = parseGitHubRepo(params.remoteUrl);
  if (!repo) return { ok: false, error: "Could not parse owner/repo from GitHub URL" };

  const url = `https://api.github.com/repos/${repo.owner}/${repo.repo}/actions/workflows/${encodeURIComponent(params.workflowFile)}/dispatches`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.ciToken}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: params.branch, inputs: params.inputs }),
  });

  if (res.status === 204) return { ok: true };

  let msg = `GitHub API error ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string };
    if (body.message) msg += `: ${body.message}`;
  } catch { /* ignore */ }
  return { ok: false, error: msg };
}

// ── GitLab CI ─────────────────────────────────────────────────────────────────

function parseGitLabProjectPath(remoteUrl: string): string | null {
  // https://gitlab.com/group/subgroup/project.git → group%2Fsubgroup%2Fproject
  const m = /gitlab[^/]*\/(.+?)(?:\.git)?$/i.exec(remoteUrl);
  if (!m) return null;
  return encodeURIComponent(m[1]);
}

function gitLabHostname(remoteUrl: string): string {
  const m = /https?:\/\/([^/]+)/i.exec(remoteUrl);
  return m ? m[1] : "gitlab.com";
}

async function triggerGitLab(params: TriggerParams): Promise<TriggerResult> {
  const projectPath = parseGitLabProjectPath(params.remoteUrl);
  if (!projectPath) return { ok: false, error: "Could not parse project path from GitLab URL" };

  const host = gitLabHostname(params.remoteUrl);
  const url = `https://${host}/api/v4/projects/${projectPath}/pipeline`;
  const variables = Object.entries(params.inputs).map(([key, value]) => ({
    key: key.toUpperCase(),
    value,
    variable_type: "env_var",
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: { "PRIVATE-TOKEN": params.ciToken, "Content-Type": "application/json" },
    body: JSON.stringify({ ref: params.branch, variables }),
  });

  if (res.ok) return { ok: true };

  let msg = `GitLab API error ${res.status}`;
  try {
    const body = (await res.json()) as { message?: string | string[] };
    if (body.message) msg += `: ${JSON.stringify(body.message)}`;
  } catch { /* ignore */ }
  return { ok: false, error: msg };
}

// ── Bitbucket Pipelines ───────────────────────────────────────────────────────

function parseBitbucketRepo(remoteUrl: string): { workspace: string; repoSlug: string } | null {
  const m = /bitbucket\.org[/:]([^/]+)\/([^/.]+)/i.exec(remoteUrl);
  if (!m) return null;
  return { workspace: m[1], repoSlug: m[2].replace(/\.git$/, "") };
}

async function triggerBitbucket(params: TriggerParams): Promise<TriggerResult> {
  const repo = parseBitbucketRepo(params.remoteUrl);
  if (!repo) return { ok: false, error: "Could not parse workspace/repo from Bitbucket URL" };

  const url = `https://api.bitbucket.org/2.0/repositories/${repo.workspace}/${repo.repoSlug}/pipelines/`;
  const variables = Object.entries(params.inputs).map(([key, value]) => ({
    key: key.toUpperCase(),
    value,
    secured: false,
  }));

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.ciToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      target: { ref_type: "branch", type: "pipeline_ref_target", ref_name: params.branch },
      variables,
    }),
  });

  if (res.ok) return { ok: true };

  let msg = `Bitbucket API error ${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string } };
    if (body.error?.message) msg += `: ${body.error.message}`;
  } catch { /* ignore */ }
  return { ok: false, error: msg };
}
