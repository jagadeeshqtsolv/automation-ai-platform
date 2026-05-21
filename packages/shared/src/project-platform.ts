import { z } from "zod";

/** Automation target for a project — drives framework folder and test runner. */
export const projectPlatformTypeSchema = z.enum(["mobile", "web"]);

export type ProjectPlatformType = z.infer<typeof projectPlatformTypeSchema>;

export function projectPlatformLabel(platform: ProjectPlatformType): string {
  return platform === "web" ? "Web (Playwright)" : "Mobile (Mobilewright)";
}
