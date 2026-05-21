/** Strip UTF-8 BOM and surrounding whitespace before JSON.parse. */
export function parseViewTreeJson(raw: string): unknown {
  const trimmed = raw.trim().replace(/^\uFEFF/, "");
  if (trimmed.length === 0) {
    throw new SyntaxError("Empty JSON");
  }

  let parsed: unknown = JSON.parse(trimmed);

  // Handle double-encoded snapshot (string containing JSON).
  if (typeof parsed === "string") {
    const inner = parsed.trim().replace(/^\uFEFF/, "");
    if (inner.length === 0) {
      throw new SyntaxError("Empty JSON string");
    }
    parsed = JSON.parse(inner);
  }

  return parsed;
}
