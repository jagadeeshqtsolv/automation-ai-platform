import { readFile } from "node:fs/promises";
import path from "node:path";
import { getWebCoreRoot } from "@/lib/local-framework/paths";

/** Reads a file from packages/web-core/ and returns its content as a UTF-8 string. */
export async function readWebCoreFile(relativePath: string): Promise<string> {
  const root = getWebCoreRoot();
  return readFile(path.join(root, relativePath), "utf-8");
}
