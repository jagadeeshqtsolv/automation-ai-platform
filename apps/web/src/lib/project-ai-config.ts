import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModel } from "ai";
import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/auth/api-auth";
import { decryptSecret, maskSecret } from "@/lib/secret-crypto";
import { prisma } from "@/lib/prisma";

export type AIProvider = "openai" | "claude";

export const DEFAULT_OPENAI_MODEL = "gpt-4.1";
export const DEFAULT_CLAUDE_MODEL = "claude-sonnet-4-6";

export const AI_NOT_CONFIGURED_MESSAGE =
  "AI provider is not configured for this project. Add your API key in Setup → AI before generating tests.";

export type ResolvedAIModel = {
  model: LanguageModel;
  modelId: string;
  provider: AIProvider;
  isReasoningModel: boolean;
};

const REASONING_MODEL_PREFIXES = ["o1", "o3", "o4", "o-"];
const REASONING_MODEL_IDS = new Set(["gpt-5"]);

export function isReasoningModelId(modelId: string): boolean {
  const id = modelId.toLowerCase().trim();
  return REASONING_MODEL_IDS.has(id) || REASONING_MODEL_PREFIXES.some((p) => id.startsWith(p));
}

export type ProjectAISettingsView = {
  activeProvider: AIProvider | null;
  openai: {
    configured: boolean;
    apiKeyPreview: string | null;
    model: string;
    suggestedModel: string;
  };
  claude: {
    configured: boolean;
    apiKeyPreview: string | null;
    model: string;
    suggestedModel: string;
  };
  canEdit: boolean;
};

function decryptKey(enc: string | null): string | null {
  if (!enc || enc.length === 0) return null;
  const key = decryptSecret(enc);
  return key && key.trim().length > 0 ? key.trim() : null;
}

/** Resolve the active AI model for a project. Throws if not configured. */
export async function resolveAIModel(projectId: string): Promise<ResolvedAIModel> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      aiProvider: true,
      openaiApiKeyEnc: true,
      openaiModel: true,
      claudeApiKeyEnc: true,
      claudeModel: true,
    },
  });

  if (project === null) throw new Error(AI_NOT_CONFIGURED_MESSAGE);

  const provider = (project.aiProvider as AIProvider | null) ?? "openai";

  if (provider === "claude") {
    const apiKey = decryptKey(project.claudeApiKeyEnc);
    if (!apiKey) throw new Error(AI_NOT_CONFIGURED_MESSAGE);
    const modelId = project.claudeModel?.trim() || DEFAULT_CLAUDE_MODEL;
    return {
      model: createAnthropic({ apiKey })(modelId),
      modelId,
      provider: "claude",
      isReasoningModel: false,
    };
  }

  const apiKey = decryptKey(project.openaiApiKeyEnc);
  if (!apiKey) throw new Error(AI_NOT_CONFIGURED_MESSAGE);
  const modelId = project.openaiModel?.trim() || DEFAULT_OPENAI_MODEL;
  return {
    model: createOpenAI({ apiKey })(modelId),
    modelId,
    provider: "openai",
    isReasoningModel: isReasoningModelId(modelId),
  };
}

export async function getProjectAISettingsView(
  projectId: string,
  userId: string,
): Promise<ProjectAISettingsView | null> {
  const access = await requireProjectAccess(userId, projectId);
  if (access instanceof NextResponse) return null;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      aiProvider: true,
      openaiApiKeyEnc: true,
      openaiModel: true,
      claudeApiKeyEnc: true,
      claudeModel: true,
    },
  });
  if (project === null) return null;

  const openaiKey = decryptKey(project.openaiApiKeyEnc);
  const claudeKey = decryptKey(project.claudeApiKeyEnc);

  // Only report a provider as active when its key actually exists.
  // This prevents a stale aiProvider DB value from showing a "configured" banner after a key is removed.
  const storedProvider = project.aiProvider as AIProvider | null;
  const activeProvider: AIProvider | null =
    storedProvider === "claude" && claudeKey !== null ? "claude" :
    storedProvider === "openai" && openaiKey !== null ? "openai" :
    openaiKey !== null ? "openai" :
    claudeKey !== null ? "claude" :
    null;

  return {
    activeProvider,
    openai: {
      configured: openaiKey !== null,
      apiKeyPreview: openaiKey ? maskSecret(decryptSecret(project.openaiApiKeyEnc!)!) : null,
      model: project.openaiModel?.trim() ?? "",
      suggestedModel: DEFAULT_OPENAI_MODEL,
    },
    claude: {
      configured: claudeKey !== null,
      apiKeyPreview: claudeKey ? maskSecret(decryptSecret(project.claudeApiKeyEnc!)!) : null,
      model: project.claudeModel?.trim() ?? "",
      suggestedModel: DEFAULT_CLAUDE_MODEL,
    },
    canEdit: true,
  };
}
