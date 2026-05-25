import type { WebPageElement } from "@automation-ai/core";

function escapeTsString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

/** Serializes one entry in page object `L` (includes optional iframe / shadow host). */
export function formatWebLocatorSpecLine(el: WebPageElement): string {
  const fields: string[] = [`strategy: '${el.strategy}' as const`, `value: '${escapeTsString(el.value)}'`];
  if (el.role !== undefined && el.role.length > 0) {
    fields.push(`role: '${escapeTsString(el.role)}'`);
  }
  if (el.frame !== undefined && el.frame.trim().length > 0) {
    fields.push(`frame: '${escapeTsString(el.frame.trim())}'`);
  }
  if (el.shadowHost !== undefined && el.shadowHost.trim().length > 0) {
    fields.push(`shadowHost: '${escapeTsString(el.shadowHost.trim())}'`);
  }
  if (el.index !== undefined && el.index >= 0) {
    fields.push(`index: ${el.index}`);
  }
  fields.push(`actionKind: '${el.actionKind}' as const`);
  return `    ${el.key}: { ${fields.join(", ")} },`;
}
