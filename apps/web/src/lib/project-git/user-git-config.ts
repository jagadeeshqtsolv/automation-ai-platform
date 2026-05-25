import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secret-crypto";

export type UserGitConfigView = {
  /** User's working branch for PRs. Null means not configured yet. */
  branch: string | null;
  authorName: string | null;
  authorEmail: string | null;
  hasToken: boolean;
  tokenPreview: string | null;
};

export async function getUserGitConfigView(
  projectId: string,
  userId: string,
): Promise<UserGitConfigView> {
  const row = await prisma.projectUserGitConfig.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { gitBranch: true, gitAuthorName: true, gitAuthorEmail: true, gitTokenEnc: true },
  });

  const hasToken = (row?.gitTokenEnc ?? null) !== null;
  const tokenPreview = row?.gitTokenEnc
    ? maskSecret(decryptSecret(row.gitTokenEnc) ?? "")
    : null;

  return {
    branch: row?.gitBranch ?? null,
    authorName: row?.gitAuthorName ?? null,
    authorEmail: row?.gitAuthorEmail ?? null,
    hasToken,
    tokenPreview,
  };
}

export async function getUserGitToken(projectId: string, userId: string): Promise<string | null> {
  const row = await prisma.projectUserGitConfig.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { gitTokenEnc: true },
  });
  if (!row?.gitTokenEnc) return null;
  return decryptSecret(row.gitTokenEnc);
}

export async function saveUserGitConfig(
  projectId: string,
  userId: string,
  updates: {
    gitBranch?: string | null;
    gitAuthorName?: string | null;
    gitAuthorEmail?: string | null;
    gitToken?: string | null;
  },
): Promise<void> {
  const data: {
    gitBranch?: string | null;
    gitAuthorName?: string | null;
    gitAuthorEmail?: string | null;
    gitTokenEnc?: string | null;
  } = {};

  if (updates.gitBranch !== undefined) data.gitBranch = updates.gitBranch;
  if (updates.gitAuthorName !== undefined) data.gitAuthorName = updates.gitAuthorName;
  if (updates.gitAuthorEmail !== undefined) data.gitAuthorEmail = updates.gitAuthorEmail;
  if (updates.gitToken !== undefined) {
    data.gitTokenEnc = updates.gitToken === null ? null : encryptSecret(updates.gitToken.trim());
  }

  if (Object.keys(data).length === 0) return;

  await prisma.projectUserGitConfig.upsert({
    where: { projectId_userId: { projectId, userId } },
    create: { projectId, userId, ...data },
    update: data,
  });
}
