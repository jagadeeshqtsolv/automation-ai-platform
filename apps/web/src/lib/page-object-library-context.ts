import { pageObjectFixtureName } from "@/lib/generate-test-fixtures";
import type { PageObjectLibraryEntry } from "@/lib/generate-mobilewright-bundle";
import { enrichWebPageObjectWithStepMethods } from "@/lib/enrich-web-page-object-step-methods";

export function extractAsyncMethodNames(content: string): string[] {
  const names: string[] = [];
  const re = /\basync\s+(\w+)\s*\(/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(content)) !== null) {
    if (match[1] !== "constructor") {
      names.push(match[1]);
    }
  }
  return names;
}

export function buildPageObjectLibraryCatalog(pages: PageObjectLibraryEntry[]): string {
  if (pages.length === 0) {
    return "No page objects in the project library yet.";
  }

  const lines = [
    "Use ONLY these existing page object classes and their public methods in testFiles.",
    "Do NOT create pageObjectFiles when a class below already covers the screen.",
    "",
  ];

  for (const page of pages) {
    const fixture = pageObjectFixtureName(page.className);
    let methods = extractAsyncMethodNames(page.content);
    if (methods.length === 0) {
      methods = extractAsyncMethodNames(enrichWebPageObjectWithStepMethods(page.content));
    }
    const methodLine =
      methods.length > 0 ? methods.join(", ") : page.methodSummary.trim() || "(none)";

    lines.push(`### ${page.className}`);
    if (page.screenName !== undefined && page.screenName !== null && page.screenName.trim().length > 0) {
      lines.push(`- Handles screen: ${page.screenName.trim()}`);
    }
    lines.push(`- Fixture parameter: \`${fixture}\` (inject in test callback: async ({ ${fixture}, ... })`);
    lines.push(`- Module: ${page.modulePath}`);
    lines.push(`- Callable methods: ${methodLine}`);
    lines.push("");
  }

  return lines.join("\n");
}

export function stripRedundantGeneratedPageObjects(
  pageObjectFiles: Array<{ path: string; content: string }>,
  library: PageObjectLibraryEntry[],
): Array<{ path: string; content: string }> {
  if (library.length === 0) {
    return pageObjectFiles;
  }

  const libraryPaths = new Set(library.map((p) => p.modulePath.trim().replace(/^\.\//, "")));
  const libraryClasses = new Set(library.map((p) => p.className));

  return pageObjectFiles.filter((file) => {
    const rel = file.path.trim().replace(/^\.\//, "");
    if (libraryPaths.has(rel)) {
      return false;
    }
    const exported = /export\s+class\s+(\w+)/.exec(file.content);
    if (exported?.[1] !== undefined && libraryClasses.has(exported[1])) {
      return false;
    }
    return true;
  });
}
