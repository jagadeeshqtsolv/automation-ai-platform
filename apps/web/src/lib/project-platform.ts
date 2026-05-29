import type { ProjectPlatformType } from "@jagadeeshqtsolv/core";
import { projectPlatformTypeSchema } from "@jagadeeshqtsolv/core";
import { prisma } from "@/lib/prisma";

export type { ProjectPlatformType };

export async function getProjectPlatformType(projectId: string): Promise<ProjectPlatformType> {
  const row = await prisma.project.findUnique({
    where: { id: projectId },
    select: { platformType: true },
  });
  if (row === null) {
    return "mobile";
  }
  const parsed = projectPlatformTypeSchema.safeParse(row.platformType);
  return parsed.success ? parsed.data : "mobile";
}
