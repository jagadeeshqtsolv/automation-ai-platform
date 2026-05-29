export type JiraStory = {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  status: string;
};

function buildBasicAuth(email: string, token: string): string {
  return "Basic " + Buffer.from(`${email}:${token}`).toString("base64");
}

function adfToText(node: unknown, depth = 0): string {
  if (!node || typeof node !== "object") return "";
  const n = node as Record<string, unknown>;

  if (n.type === "text" && typeof n.text === "string") {
    return n.text;
  }

  if (n.type === "hardBreak") return "\n";

  const content = Array.isArray(n.content) ? n.content : [];
  const parts: string[] = content.map((child) => adfToText(child, depth + 1));
  const text = parts.join("");

  const blockTypes = new Set([
    "paragraph", "blockquote", "bulletList", "orderedList",
    "listItem", "heading", "codeBlock", "rule", "panel",
  ]);
  if (n.type && blockTypes.has(n.type as string)) {
    return `\n${text}\n`;
  }
  return text;
}

function cleanAdfText(node: unknown): string {
  return adfToText(node).replace(/\n{3,}/g, "\n\n").trim();
}

export async function testJiraConnection(
  baseUrl: string,
  email: string,
  token: string,
): Promise<{ ok: boolean; serverName?: string; error?: string }> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/rest/api/3/myself`;
    const res = await fetch(url, {
      headers: {
        Authorization: buildBasicAuth(email, token),
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      if (res.status === 401) return { ok: false, error: "Authentication failed — check email and API token." };
      if (res.status === 403) return { ok: false, error: "Forbidden — the account lacks permission." };
      return { ok: false, error: `Jira responded with HTTP ${res.status}.` };
    }
    const body = (await res.json()) as { displayName?: string };
    return { ok: true, serverName: body.displayName };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Request failed";
    return { ok: false, error: `Could not reach Jira: ${msg}` };
  }
}

export async function fetchJiraStories(
  baseUrl: string,
  email: string,
  token: string,
  jql: string,
  maxResults = 50,
): Promise<JiraStory[]> {
  // Atlassian deprecated GET /rest/api/3/search (returns 410).
  // The current endpoint is POST /rest/api/3/search/jql (since 2024).
  const url = `${baseUrl.replace(/\/$/, "")}/rest/api/3/search/jql`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: buildBasicAuth(email, token),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jql,
      maxResults,
      fields: ["summary", "description", "issuetype", "status"],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    throw new Error(`Jira search returned HTTP ${res.status}`);
  }
  const body = (await res.json()) as {
    issues?: Array<{
      key: string;
      fields: {
        summary?: string;
        description?: unknown;
        issuetype?: { name?: string };
        status?: { name?: string };
      };
    }>;
  };
  return (body.issues ?? []).map((issue) => ({
    key: issue.key,
    summary: issue.fields.summary ?? "(no summary)",
    description: cleanAdfText(issue.fields.description),
    issueType: issue.fields.issuetype?.name ?? "Story",
    status: issue.fields.status?.name ?? "",
  }));
}
