import { NextResponse } from "next/server";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import { getProjectAISettingsView } from "@/lib/project-ai-config";
import { encryptSecret } from "@/lib/secret-crypto";
import { prisma } from "@/lib/prisma";

const paramsSchema = z.object({ projectId: z.string().uuid() });

const bodySchema = z.object({
  provider: z.enum(["openai", "claude"]),
  apiKey: z.string().max(256).nullish(),
  model: z.string().max(80).nullish(),
  /** When true, sets this provider as the active one. False when only removing a key. */
  setAsActive: z.boolean().optional().default(false),
});

export async function GET(_req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const settings = await getProjectAISettingsView(params.data.projectId, guard.user.id);
  if (settings === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ai: settings });
}

export async function PATCH(req: Request, context: { params: Promise<{ projectId: string }> }) {
  const params = paramsSchema.safeParse(await context.params);
  if (!params.success) {
    return NextResponse.json({ error: "Invalid project id" }, { status: 400 });
  }

  const guard = await withAuthAndProject(params.data.projectId);
  if ("error" in guard) return guard.error;

  const json: unknown = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    const detail = parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: detail || "Invalid request body" }, { status: 400 });
  }

  const { provider, apiKey, model, setAsActive } = parsed.data;

  const data: Record<string, string | null> = {};
  if (setAsActive) {
    data.aiProvider = provider;
  }

  const trimmedKey = apiKey?.trim() ?? null;
  const trimmedModel = model?.trim() || null;

  if (provider === "openai") {
    if (apiKey !== undefined) {
      data.openaiApiKeyEnc = trimmedKey ? encryptSecret(trimmedKey) : null;
    }
    if (model !== undefined) {
      data.openaiModel = trimmedModel;
    }
  } else {
    if (apiKey !== undefined) {
      data.claudeApiKeyEnc = trimmedKey ? encryptSecret(trimmedKey) : null;
    }
    if (model !== undefined) {
      data.claudeModel = trimmedModel;
    }
  }

  // If the active provider's key was removed, clear the active provider so the
  // banner doesn't show a configured-but-keyless provider.
  if (!setAsActive && apiKey === null) {
    const current = await prisma.project.findUnique({
      where: { id: params.data.projectId },
      select: { aiProvider: true },
    });
    if (current?.aiProvider === provider) {
      data.aiProvider = null;
    }
  }

  await prisma.project.update({ where: { id: params.data.projectId }, data });

  const settings = await getProjectAISettingsView(params.data.projectId, guard.user.id);
  return NextResponse.json({ ai: settings });
}
