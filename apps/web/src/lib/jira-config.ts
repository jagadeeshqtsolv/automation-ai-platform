import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secret-crypto";

export type JiraConfigView = {
  baseUrl: string | null;
  email: string | null;
  hasApiToken: boolean;
  apiTokenPreview: string | null;
  defaultJql: string | null;
};

export async function getJiraConfigView(projectId: string): Promise<JiraConfigView | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { jiraBaseUrl: true, jiraEmail: true, jiraApiTokenEnc: true, jiraDefaultJql: true },
  });
  if (!project) return null;

  const plain = project.jiraApiTokenEnc ? decryptSecret(project.jiraApiTokenEnc) : null;
  return {
    baseUrl: project.jiraBaseUrl ?? null,
    email: project.jiraEmail ?? null,
    hasApiToken: plain !== null,
    apiTokenPreview: plain !== null ? maskSecret(plain) : null,
    defaultJql: project.jiraDefaultJql ?? null,
  };
}

export async function getJiraCredentials(
  projectId: string,
): Promise<{ baseUrl: string; email: string; token: string } | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { jiraBaseUrl: true, jiraEmail: true, jiraApiTokenEnc: true },
  });
  if (!project?.jiraBaseUrl || !project.jiraEmail || !project.jiraApiTokenEnc) return null;
  const token = decryptSecret(project.jiraApiTokenEnc);
  if (!token) return null;
  return { baseUrl: project.jiraBaseUrl, email: project.jiraEmail, token };
}

export async function saveJiraConfig(
  projectId: string,
  updates: {
    baseUrl?: string | null;
    email?: string | null;
    apiToken?: string | null;
    defaultJql?: string | null;
  },
): Promise<void> {
  const data: Record<string, string | null> = {};
  if (updates.baseUrl !== undefined) data.jiraBaseUrl = updates.baseUrl;
  if (updates.email !== undefined) data.jiraEmail = updates.email;
  if (updates.apiToken !== undefined) {
    data.jiraApiTokenEnc = updates.apiToken === null ? null : encryptSecret(updates.apiToken);
  }
  if (updates.defaultJql !== undefined) data.jiraDefaultJql = updates.defaultJql;
  if (Object.keys(data).length > 0) {
    await prisma.project.update({ where: { id: projectId }, data });
  }
}
