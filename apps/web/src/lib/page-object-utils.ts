export function inferMethodSummary(content: string, fallback?: string): string {
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }
  const names: string[] = [];
  const re = /\basync\s+(\w+)\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    names.push(m[1]);
  }
  return names.slice(0, 48).join(", ");
}

export function inferClassName(content: string, fallback?: string): string | null {
  if (typeof fallback === "string" && fallback.trim().length > 0) {
    return fallback.trim();
  }
  const exported = /export\s+class\s+(\w+)/.exec(content);
  return exported?.[1] ?? null;
}
