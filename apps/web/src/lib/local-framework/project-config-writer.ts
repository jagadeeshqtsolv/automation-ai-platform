import { getProjectPlatformType } from "@/lib/project-platform";
import { writeMobilewrightConfig } from "@/lib/local-framework/scaffold";
import { writePlaywrightWebConfig } from "@/lib/local-framework/web-scaffold";

/** Sync environment JSON to the platform-specific test config file. */
export async function writeProjectTestConfig(projectId: string, configJson: string | null): Promise<void> {
  const platform = await getProjectPlatformType(projectId);
  if (platform === "web") {
    await writePlaywrightWebConfig(projectId, configJson);
    return;
  }
  await writeMobilewrightConfig(projectId, configJson);
}
