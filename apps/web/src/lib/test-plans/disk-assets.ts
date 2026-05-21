import { readdir } from "node:fs/promises";
import path from "node:path";
import { deleteFrameworkFile } from "@/lib/local-framework/delete-project";
import { getProjectFrameworkRoot } from "@/lib/local-framework/paths";

export function testCaseDiskFileId(testPlanId: string, testCaseId: string): string {
  const safeCaseId = testCaseId.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^-+|-+$/g, "").slice(0, 120);
  const segment = safeCaseId.length > 0 ? safeCaseId : "item";
  return `${testPlanId}__${segment}`;
}

export async function deleteTestPlanDiskAssets(projectId: string, testPlanId: string): Promise<void> {
  await deleteFrameworkFile(projectId, `test-plans/${testPlanId}.json`);

  const root = path.join(getProjectFrameworkRoot(projectId), "test-cases");
  const prefix = `${testPlanId}__`;
  let entries: string[];
  try {
    entries = await readdir(root);
  } catch {
    return;
  }

  await Promise.all(
    entries
      .filter((name) => name.startsWith(prefix) && name.endsWith(".json"))
      .map((name) => deleteFrameworkFile(projectId, `test-cases/${name}`)),
  );
}

export async function deleteTestCaseDiskAsset(
  projectId: string,
  testPlanId: string,
  testCaseId: string,
): Promise<void> {
  const fileId = testCaseDiskFileId(testPlanId, testCaseId);
  await deleteFrameworkFile(projectId, `test-cases/${fileId}.json`);
}
