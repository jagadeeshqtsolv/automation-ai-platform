import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, maskSecret } from "@/lib/secret-crypto";

export type ProjectGitConfigView = {
  /** Shared repo URL — set once by admin */
  remoteUrl: string | null;
  /** Protected base branch (PR target, default: main) */
  baseBranch: string;
};

export async function getProjectGitConfigView(
  projectId: string,
): Promise<ProjectGitConfigView | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { gitRemoteUrl: true, gitBaseBranch: true },
  });
  if (!project) return null;

  return {
    remoteUrl: project.gitRemoteUrl ?? null,
    baseBranch: project.gitBaseBranch ?? "main",
  };
}

export async function saveProjectGitConfig(
  projectId: string,
  updates: {
    gitRemoteUrl?: string | null;
    gitBaseBranch?: string | null;
  },
): Promise<void> {
  const data: { gitRemoteUrl?: string | null; gitBaseBranch?: string | null } = {};
  if (updates.gitRemoteUrl !== undefined) data.gitRemoteUrl = updates.gitRemoteUrl;
  if (updates.gitBaseBranch !== undefined) data.gitBaseBranch = updates.gitBaseBranch;
  if (Object.keys(data).length > 0) {
    await prisma.project.update({ where: { id: projectId }, data });
  }
}

export type ProjectCiConfigView = {
  workflowFile: string;
  hasCiToken: boolean;
  ciTokenPreview: string | null;
};

export async function getProjectCiConfigView(
  projectId: string,
): Promise<ProjectCiConfigView | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { gitCiTokenEnc: true, gitWorkflowFile: true },
  });
  if (!project) return null;

  const plain = project.gitCiTokenEnc ? decryptSecret(project.gitCiTokenEnc) : null;
  return {
    workflowFile: project.gitWorkflowFile ?? "run-tests.yml",
    hasCiToken: plain !== null,
    ciTokenPreview: plain !== null ? maskSecret(plain) : null,
  };
}

export async function getProjectCiToken(projectId: string): Promise<string | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { gitCiTokenEnc: true },
  });
  if (!project?.gitCiTokenEnc) return null;
  return decryptSecret(project.gitCiTokenEnc);
}

export async function saveProjectCiConfig(
  projectId: string,
  updates: { gitCiToken?: string | null; gitWorkflowFile?: string | null },
): Promise<void> {
  const data: { gitCiTokenEnc?: string | null; gitWorkflowFile?: string | null } = {};
  if (updates.gitCiToken !== undefined) {
    data.gitCiTokenEnc =
      updates.gitCiToken === null ? null : encryptSecret(updates.gitCiToken);
  }
  if (updates.gitWorkflowFile !== undefined) {
    data.gitWorkflowFile = updates.gitWorkflowFile;
  }
  if (Object.keys(data).length > 0) {
    await prisma.project.update({ where: { id: projectId }, data });
  }
}
