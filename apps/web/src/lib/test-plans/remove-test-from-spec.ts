import type { TestCase } from "@jagadeeshqtsolv/core";
import { listTestSpecFiles } from "@/lib/test-execution/list-test-specs";
import { readFrameworkFile, writeFrameworkFiles } from "@/lib/local-framework/writer";

const DELETED_TESTS_DIR = "tests/deleted";

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function safeCaseFileName(testCaseId: string): string {
  const cleaned = testCaseId.replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/^-+|-+$/g, "").slice(0, 120);
  return cleaned.length > 0 ? cleaned : "case";
}

function caseIdTag(testCaseId: string): string {
  const trimmed = testCaseId.trim();
  return trimmed.startsWith("@") ? trimmed : `@${trimmed}`;
}

/** Whether a single test() block in a spec file belongs to the given plan case. */
export function testBlockMatchesCase(block: string, testCase: TestCase): boolean {
  const idTag = caseIdTag(testCase.id);
  if (new RegExp(`["']${escapeRegExp(idTag)}["']`).test(block)) {
    return true;
  }
  if (testCase.id !== idTag && new RegExp(`["']${escapeRegExp(testCase.id)}["']`).test(block)) {
    return true;
  }

  const titleRe = new RegExp(`test\\s*\\(\\s*(['"])${escapeRegExp(testCase.title)}\\1`);
  return titleRe.test(block);
}

export function findTestBlockStarts(content: string): number[] {
  const indices: number[] = [];
  const re = /(?:^|\n)(\s*)test\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    const offset = match[0].startsWith("\n") ? 1 : 0;
    indices.push(match.index + offset);
  }
  return indices;
}

export function findTestBlockEnd(content: string, testStart: number): number {
  const asyncIdx = content.indexOf("async", testStart);
  if (asyncIdx === -1) {
    return -1;
  }
  const arrowIdx = content.indexOf("=>", asyncIdx);
  if (arrowIdx === -1) {
    return -1;
  }
  const bodyOpen = content.indexOf("{", arrowIdx);
  if (bodyOpen === -1) {
    return -1;
  }

  let depth = 0;
  let inString: "'" | '"' | "`" | null = null;
  let escape = false;

  for (let j = bodyOpen; j < content.length; j++) {
    const ch = content[j];
    if (inString !== null) {
      if (escape) {
        escape = false;
      } else if (ch === "\\") {
        escape = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      inString = ch;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        let end = j + 1;
        while (end < content.length && /\s/.test(content[end])) {
          end++;
        }
        if (content[end] === ")") {
          end++;
        }
        while (end < content.length && /\s/.test(content[end])) {
          end++;
        }
        if (content[end] === ";") {
          end++;
        }
        if (content[end] === "\r" && content[end + 1] === "\n") {
          end += 2;
        } else if (content[end] === "\n") {
          end++;
        }
        return end;
      }
    }
  }
  return -1;
}

/** Removes matching test() blocks from spec source. */
export function removeTestCaseFromSpecContent(
  content: string,
  testCase: TestCase,
): { content: string; extractedBlocks: string[]; removed: boolean } {
  const starts = findTestBlockStarts(content);
  if (starts.length === 0) {
    return { content, extractedBlocks: [], removed: false };
  }

  const toRemove: Array<{ start: number; end: number; block: string }> = [];
  for (const start of starts) {
    const end = findTestBlockEnd(content, start);
    if (end < 0) {
      continue;
    }
    const block = content.slice(start, end).trimEnd();
    if (testBlockMatchesCase(block, testCase)) {
      toRemove.push({ start, end, block });
    }
  }

  if (toRemove.length === 0) {
    return { content, extractedBlocks: [], removed: false };
  }

  let out = content;
  for (const { start, end } of toRemove.sort((a, b) => b.start - a.start)) {
    out = out.slice(0, start) + out.slice(end);
  }

  out = out.replace(/\n{3,}/g, "\n\n").trimEnd();
  if (out.length > 0 && !out.endsWith("\n")) {
    out += "\n";
  }

  return {
    content: out,
    extractedBlocks: toRemove.map((r) => r.block),
    removed: true,
  };
}

function buildArchivedSpecFile(params: {
  sourceSpecPath: string;
  testCase: TestCase;
  blocks: string[];
}): string {
  const header = [
    `// Archived from ${params.sourceSpecPath} (test case ${params.testCase.id})`,
    `import { test, expect } from '../../support/fixtures';`,
    "",
  ].join("\n");
  return `${header}${params.blocks.join("\n\n")}\n`;
}

function isActiveSpecPath(specPath: string): boolean {
  return specPath.startsWith("tests/") && !specPath.startsWith(`${DELETED_TESTS_DIR}/`);
}

/**
 * Removes the test from active spec files and writes archived copy under tests/deleted/.
 * Does not modify requirements/ or other workspace metadata.
 */
export async function archiveTestCaseFromSpecs(params: {
  projectId: string;
  projectName: string;
  testCase: TestCase;
}): Promise<boolean> {
  const specs = await listTestSpecFiles(params.projectId);
  const activeSpecs = specs.filter((s) => isActiveSpecPath(s.path));
  if (activeSpecs.length === 0) {
    return false;
  }

  const filesToWrite: Array<{ relativePath: string; content: string }> = [];
  const allExtracted: string[] = [];
  let sourceSpecPath: string | null = null;

  for (const spec of activeSpecs) {
    const existing = await readFrameworkFile(params.projectId, spec.path);
    if (existing === null) {
      continue;
    }

    const { content, extractedBlocks, removed } = removeTestCaseFromSpecContent(existing, params.testCase);
    if (!removed) {
      continue;
    }

    sourceSpecPath = spec.path;
    allExtracted.push(...extractedBlocks);
    filesToWrite.push({ relativePath: spec.path, content });
  }

  if (allExtracted.length === 0 || sourceSpecPath === null) {
    return false;
  }

  const archivePath = `${DELETED_TESTS_DIR}/${safeCaseFileName(params.testCase.id)}.spec.ts`;
  filesToWrite.push({
    relativePath: archivePath,
    content: buildArchivedSpecFile({
      sourceSpecPath,
      testCase: params.testCase,
      blocks: allExtracted,
    }),
  });

  await writeFrameworkFiles({
    projectId: params.projectId,
    projectName: params.projectName,
    files: filesToWrite,
    overwritePageObjects: false,
    overwriteTests: true,
  });

  return true;
}
