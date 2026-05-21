/** Removes line and block comments from generated TypeScript (strings preserved). */
export function stripTypeScriptComments(source: string): string {
  const withoutBlocks = source.replace(/\/\*[\s\S]*?\*\//g, "");
  const lines = withoutBlocks.split("\n").map(stripLineComment).map((line) => line.trimEnd());

  const out: string[] = [];
  let blankRun = 0;
  for (const line of lines) {
    if (line.trim().length === 0) {
      blankRun += 1;
      if (blankRun <= 1) out.push("");
      continue;
    }
    blankRun = 0;
    out.push(line);
  }

  return out.join("\n").trim() + "\n";
}

function stripLineComment(line: string): string {
  let inSingle = false;
  let inDouble = false;
  let inTemplate = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    const prev = i > 0 ? line[i - 1] : "";

    if (!inDouble && !inTemplate && ch === "'" && prev !== "\\") {
      inSingle = !inSingle;
      continue;
    }
    if (!inSingle && !inTemplate && ch === '"' && prev !== "\\") {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && ch === "`" && prev !== "\\") {
      inTemplate = !inTemplate;
      continue;
    }

    if (!inSingle && !inDouble && !inTemplate && ch === "/" && line[i + 1] === "/") {
      return line.slice(0, i).trimEnd();
    }
  }

  return line;
}
