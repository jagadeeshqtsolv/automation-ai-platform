import { NextResponse } from "next/server";
import { updateProjectOpenAISettingsBodySchema } from "@automation-ai/shared";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import {
  getProjectOpenAISettingsView,
  projectHasOpenAIKey,
} from "@/lib/project-openai-config";
import { encryptSecret } from "@/lib/secret-crypto";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const openai = await getProjectOpenAISettingsView(parsedParams.data.projectId, guard.user.id);
  if (openai === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ openai });
}

export async function PATCH(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = await context.params;
  const parsedParams = paramsSchema.safeParse(params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(parsedParams.data.projectId);
  if ("error" in guard) {
    return guard.error;
  }

  const json: unknown = await req.json().catch(() => null);
  const parsed = updateProjectOpenAISettingsBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const hasKey = await projectHasOpenAIKey(parsedParams.data.projectId);
  const removingKey = parsed.data.openaiApiKey === null;
  const addingKey =
    typeof parsed.data.openaiApiKey === "string" && parsed.data.openaiApiKey.trim().length > 0;
  if (!hasKey && !addingKey && !removingKey) {
    return NextResponse.json(
      { error: "OpenAI API key is required. Save a key in Setup before using other settings." },
      { status: 400 },
    );
  }

  const data: { openaiApiKeyEnc?: string | null; openaiModel?: string | null } = {};

  if (parsed.data.openaiApiKey !== undefined) {
    if (parsed.data.openaiApiKey === null) {
      data.openaiApiKeyEnc = null;
    } else {
      data.openaiApiKeyEnc = encryptSecret(parsed.data.openaiApiKey.trim());
    }
  }

  if (parsed.data.openaiModel !== undefined) {
    data.openaiModel =
      parsed.data.openaiModel === null ? null : parsed.data.openaiModel.trim();
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "No settings to update" }, { status: 400 });
  }

  await prisma.project.update({
    where: { id: parsedParams.data.projectId },
    data,
  });

  const openai = await getProjectOpenAISettingsView(parsedParams.data.projectId, guard.user.id);
  return NextResponse.json({ openai });
}
