import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth/api-auth";
import { decryptSecret, maskSecret } from "@/lib/secret-crypto";
import { prisma } from "@/lib/prisma";

export type OpenAIConfigSource = "project" | "none";

export const OPENAI_NOT_CONFIGURED_MESSAGE =
  "OpenAI API key is not configured for this project. Add your API key in Setup before generating tests.";

export type ResolvedOpenAIConfig = {
  apiKey: string | null;
  model: string;
  source: OpenAIConfigSource;
};

export const DEFAULT_OPENAI_MODEL = "gpt-4.1";

export async function projectHasOpenAIKey(projectId: string): Promise<boolean> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { openaiApiKeyEnc: true },
  });
  if (project === null || project.openaiApiKeyEnc === null || project.openaiApiKeyEnc.length === 0) {
    return false;
  }
  const decrypted = decryptSecret(project.openaiApiKeyEnc);
  return decrypted !== null && decrypted.trim().length > 0;
}

/** Project-scoped config: only a key saved in Setup is used (no server .env fallback). */
export async function resolveOpenAIConfig(projectId: string): Promise<ResolvedOpenAIConfig> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { openaiApiKeyEnc: true, openaiModel: true },
  });

  const model =
    project !== null &&
    typeof project.openaiModel === "string" &&
    project.openaiModel.trim().length > 0
      ? project.openaiModel.trim()
      : DEFAULT_OPENAI_MODEL;

  if (project === null) {
    return { apiKey: null, model, source: "none" };
  }

  if (typeof project.openaiApiKeyEnc === "string" && project.openaiApiKeyEnc.length > 0) {
    const decrypted = decryptSecret(project.openaiApiKeyEnc);
    if (decrypted !== null && decrypted.trim().length > 0) {
      return {
        apiKey: decrypted.trim(),
        model,
        source: "project",
      };
    }
  }

  return { apiKey: null, model, source: "none" };
}

export type ProjectOpenAISettingsView = {
  configured: boolean;
  apiKeyPreview: string | null;
  model: string;
  suggestedModel: string;
  canEdit: boolean;
};

export async function getProjectOpenAISettingsView(
  projectId: string,
  userId: string,
): Promise<ProjectOpenAISettingsView | null> {
  const access = await requireProjectAccess(userId, projectId);
  if (access instanceof NextResponse) {
    return null;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { openaiApiKeyEnc: true, openaiModel: true },
  });
  if (project === null) {
    return null;
  }

  const hasKey = await projectHasOpenAIKey(projectId);
  let apiKeyPreview: string | null = null;
  if (hasKey && project.openaiApiKeyEnc !== null) {
    const decrypted = decryptSecret(project.openaiApiKeyEnc);
    if (decrypted !== null) {
      apiKeyPreview = maskSecret(decrypted);
    }
  }

  const savedModel =
    typeof project.openaiModel === "string" && project.openaiModel.trim().length > 0
      ? project.openaiModel.trim()
      : "";

  return {
    configured: hasKey,
    apiKeyPreview,
    model: savedModel,
    suggestedModel: DEFAULT_OPENAI_MODEL,
    canEdit: true,
  };
}
