import { NextResponse } from "next/server";
import { updateExecutionConfigBodySchema, ciRunConfigSchema, DEFAULT_CI_RUN_CONFIG } from "@automation-ai/core";
import { z } from "zod";
import { withAuthAndProject } from "@/lib/auth/route-guards";
import {
  decryptAccessKey,
  encryptAccessKey,
  parseExecutionConfigDocument,
  providerLabel,
  serializeExecutionConfigDocument,
} from "@/lib/execution-config";
import { maskSecret } from "@/lib/secret-crypto";
import { prisma } from "@/lib/prisma";
import { generateWorkflowTemplate } from "@/lib/project-git/workflow-template";
import { writeFrameworkFiles } from "@/lib/local-framework/writer";

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

  const project = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { executionConfigJson: true },
  });
  if (project === null) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const doc = parseExecutionConfigDocument(project.executionConfigJson);
  const sauceKey = decryptAccessKey(doc.secrets.saucelabsAccessKeyEnc);
  const bsKey = decryptAccessKey(doc.secrets.browserstackAccessKeyEnc);
  const ltKey = decryptAccessKey(doc.secrets.lambdatestAccessKeyEnc);

  return NextResponse.json({
    config: doc.config,
    providerLabel: providerLabel(doc.config.provider),
    ciRunConfig: doc.ciRunConfig ?? DEFAULT_CI_RUN_CONFIG,
    secrets: {
      saucelabsAccessKeyConfigured: sauceKey !== null,
      saucelabsAccessKeyPreview: sauceKey !== null ? maskSecret(sauceKey) : null,
      browserstackAccessKeyConfigured: bsKey !== null,
      browserstackAccessKeyPreview: bsKey !== null ? maskSecret(bsKey) : null,
      lambdatestAccessKeyConfigured: ltKey !== null,
      lambdatestAccessKeyPreview: ltKey !== null ? maskSecret(ltKey) : null,
    },
  });
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
  const parsed = updateExecutionConfigBodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
  const parsedCiRunConfig = ciRunConfigSchema.optional().safeParse(
    (json as Record<string, unknown> | null)?.ciRunConfig,
  );
  const incomingCiRunConfig = parsedCiRunConfig.success ? parsedCiRunConfig.data : undefined;

  const projectRow = await prisma.project.findUnique({
    where: { id: parsedParams.data.projectId },
    select: { executionConfigJson: true, platformType: true, name: true },
  });

  const existing = parseExecutionConfigDocument(projectRow?.executionConfigJson);

  const config = parsed.data.config;
  const nextSauceKey =
    parsed.data.saucelabsAccessKey !== undefined
      ? parsed.data.saucelabsAccessKey
      : decryptAccessKey(existing.secrets.saucelabsAccessKeyEnc);
  const nextBsKey =
    parsed.data.browserstackAccessKey !== undefined
      ? parsed.data.browserstackAccessKey
      : decryptAccessKey(existing.secrets.browserstackAccessKeyEnc);
  const nextLtKey =
    parsed.data.lambdatestAccessKey !== undefined
      ? parsed.data.lambdatestAccessKey
      : decryptAccessKey(existing.secrets.lambdatestAccessKeyEnc);

  if (config.provider === "saucelabs") {
    const username = config.saucelabs?.username?.trim() ?? "";
    if (username.length === 0) {
      return NextResponse.json({ error: "Sauce Labs username is required" }, { status: 400 });
    }
    if (nextSauceKey === null || nextSauceKey.length === 0) {
      return NextResponse.json({ error: "Sauce Labs access key is required" }, { status: 400 });
    }
  }
  if (config.provider === "browserstack") {
    const username = config.browserstack?.username?.trim() ?? "";
    if (username.length === 0) {
      return NextResponse.json({ error: "BrowserStack username is required" }, { status: 400 });
    }
    if (nextBsKey === null || nextBsKey.length === 0) {
      return NextResponse.json({ error: "BrowserStack access key is required" }, { status: 400 });
    }
  }
  if (config.provider === "lambdatest") {
    const username = config.lambdatest?.username?.trim() ?? "";
    if (username.length === 0) {
      return NextResponse.json({ error: "LambdaTest username is required" }, { status: 400 });
    }
    if (nextLtKey === null || nextLtKey.length === 0) {
      return NextResponse.json({ error: "LambdaTest access key is required" }, { status: 400 });
    }
  }
  if (config.provider === "custom") {
    const hubUrl = config.custom?.hubUrl?.trim() ?? "";
    if (hubUrl.length === 0) {
      return NextResponse.json({ error: "Custom Appium hub URL is required" }, { status: 400 });
    }
  }

  const secrets = { ...existing.secrets };

  if (parsed.data.saucelabsAccessKey !== undefined) {
    secrets.saucelabsAccessKeyEnc =
      parsed.data.saucelabsAccessKey === null
        ? null
        : encryptAccessKey(parsed.data.saucelabsAccessKey);
  }
  if (parsed.data.browserstackAccessKey !== undefined) {
    secrets.browserstackAccessKeyEnc =
      parsed.data.browserstackAccessKey === null
        ? null
        : encryptAccessKey(parsed.data.browserstackAccessKey);
  }
  if (parsed.data.lambdatestAccessKey !== undefined) {
    secrets.lambdatestAccessKeyEnc =
      parsed.data.lambdatestAccessKey === null ? null : encryptAccessKey(parsed.data.lambdatestAccessKey);
  }

  const nextCiRunConfig = incomingCiRunConfig ?? existing.ciRunConfig ?? DEFAULT_CI_RUN_CONFIG;

  const doc = serializeExecutionConfigDocument({
    config: parsed.data.config,
    secrets,
    ciRunConfig: nextCiRunConfig,
  });

  await prisma.project.update({
    where: { id: parsedParams.data.projectId },
    data: { executionConfigJson: doc },
  });

  if (incomingCiRunConfig !== undefined && projectRow?.platformType === "web") {
    const yaml = generateWorkflowTemplate("github", "run-tests.yml", "web", nextCiRunConfig);
    await writeFrameworkFiles({
      projectId: parsedParams.data.projectId,
      projectName: projectRow.name,
      files: [{ relativePath: ".github/workflows/run-tests.yml", content: yaml }],
      overwritePageObjects: false,
      overwriteTests: false,
    }).catch(() => undefined);
  }

  const sauceKey = decryptAccessKey(secrets.saucelabsAccessKeyEnc);
  return NextResponse.json({
    config: parsed.data.config,
    providerLabel: providerLabel(parsed.data.config.provider),
    ciRunConfig: nextCiRunConfig,
    secrets: {
      saucelabsAccessKeyConfigured: sauceKey !== null,
      saucelabsAccessKeyPreview: sauceKey !== null ? maskSecret(sauceKey) : null,
    },
  });
}
