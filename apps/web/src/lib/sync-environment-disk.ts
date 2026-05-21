import { writeEnvironmentSnapshot } from "@/lib/local-framework/scaffold";
import { prisma } from "@/lib/prisma";

export async function syncEnvironmentToDisk(params: {
  projectId: string;
  slug: string;
  configJson: string;
}): Promise<void> {
  await writeEnvironmentSnapshot({
    projectId: params.projectId,
    slug: params.slug,
    configJson: params.configJson,
  });
}

export async function syncAllProjectEnvironmentsToDisk(projectId: string): Promise<number> {
  const envs = await prisma.environment.findMany({
    where: { projectId },
    select: { slug: true, configJson: true },
  });
  for (const env of envs) {
    await syncEnvironmentToDisk({ projectId, slug: env.slug, configJson: env.configJson });
  }
  return envs.length;
}
