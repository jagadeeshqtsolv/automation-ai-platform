import type { WebPageElement, WebPageElementActionKind } from "@automation-ai/core";

export type DomNodeLike = {
  tagName: string;
  testId?: string;
  elementId?: string;
  name?: string;
  ariaLabel?: string;
  placeholder?: string;
  text?: string;
  role?: string;
  inputType?: string;
  isVisible: boolean;
  /** CSS selector for iframe context when element was captured inside a frame. */
  frame?: string;
  /** CSS selector for shadow host when element is inside a shadow root. */
  shadowHost?: string;
  children?: DomNodeLike[];
};

export type ParsedDomElement = {
  nodeId: string;
  tagName: string;
  suggestedKey: string;
  strategy: WebPageElement["strategy"];
  value: string;
  role?: string;
  frame?: string;
  shadowHost?: string;
  actionKind: WebPageElementActionKind;
};

type ParsedDomElementScored = ParsedDomElement & { _priority: number };

export type ParseDomSnapshotResult = {
  elements: ParsedDomElement[];
  totalMatched: number;
  truncated: boolean;
};

const INTERACTIVE_TAGS = new Set([
  "a",
  "button",
  "input",
  "select",
  "textarea",
  "summary",
]);

const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "textbox",
  "searchbox",
  "checkbox",
  "radio",
  "combobox",
  "switch",
  "tab",
  "menuitem",
]);

/** Matches saveWebPageFromBrowserBodySchema max — large captures are trimmed with a notice. */
export const MAX_PARSED_DOM_ELEMENTS = 80;

const LOCATOR_VALUE_MAX_LEN = 300;

const GENERIC_NAMES = new Set([
  "input",
  "button",
  "submit",
  "text",
  "field",
  "item",
  "element",
  "div",
  "span",
  "link",
  "menu",
  "icon",
]);

function truncateLocatorValue(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length <= LOCATOR_VALUE_MAX_LEN) {
    return trimmed;
  }
  return trimmed.slice(0, LOCATOR_VALUE_MAX_LEN);
}

function ensureUniqueElementKey(base: string, usedKeys: Set<string>): string {
  let key = base;
  let n = 2;
  while (usedKeys.has(key)) {
    key = `${base}${n}`;
    n += 1;
  }
  usedKeys.add(key);
  return key;
}

function locatorPriority(node: DomNodeLike, locator: Pick<WebPageElement, "strategy" | "value">): number {
  if (locator.strategy === "testId") return 50;
  if (locator.strategy === "css" && node.elementId !== undefined) return 40;
  if (locator.strategy === "css") return 35;
  if (locator.strategy === "label" && node.ariaLabel !== undefined) return 30;
  if (locator.strategy === "placeholder") return 28;
  if (locator.strategy === "role") return 20;
  if (locator.strategy === "text") return 10;
  return 5;
}

// 75 chars leaves room for a 2-digit dedup suffix while staying within the 80-char schema limit.
const KEY_BASE_MAX_LEN = 75;

function slugKey(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join("");
  let slug = cleaned.length === 0 ? "element" : /^\d/.test(cleaned) ? `el${cleaned}` : cleaned;
  if (slug.length > KEY_BASE_MAX_LEN) slug = slug.slice(0, KEY_BASE_MAX_LEN);
  return slug;
}

function cssEscapeIdentifier(id: string): string {
  if (/^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id)) {
    return `#${id}`;
  }
  return `[id="${id.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

function cssEscapeName(name: string): string {
  return `[name="${name.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`;
}

function inferActionKind(node: DomNodeLike): WebPageElementActionKind {
  const tag = node.tagName.toLowerCase();
  const role = node.role?.toLowerCase();
  const rawType = node.inputType?.trim().toLowerCase() ?? "";
  const idNameHint = `${node.elementId ?? ""} ${node.name ?? ""}`.toLowerCase();

  if (tag === "select" || role === "combobox") return "combobox";
  if (tag === "textarea" || role === "textbox" || role === "searchbox") return "textbox";
  if (tag === "input") {
    if (rawType === "checkbox") return "checkbox";
    if (rawType === "radio") return "radio";
    if (
      rawType === "button" ||
      rawType === "submit" ||
      rawType === "reset" ||
      rawType === "image" ||
      /button|submit|login|signin|signup/.test(idNameHint)
    ) {
      return "button";
    }
    if (rawType === "" || rawType === "text" || rawType === "password" || rawType === "email" || rawType === "search") {
      return "textbox";
    }
    return "textbox";
  }
  if (tag === "a" || role === "link") return "link";
  if (tag === "button" || role === "button") return "button";
  if (role === "checkbox") return "checkbox";
  if (role === "radio") return "radio";
  return "generic";
}

function isWeakAccessibleName(name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.length === 0 || GENERIC_NAMES.has(n) || n.length < 2;
}

function pickLocator(node: DomNodeLike): Pick<WebPageElement, "strategy" | "value" | "role"> | null {
  if (node.testId !== undefined && node.testId.trim().length > 0) {
    return { strategy: "testId", value: truncateLocatorValue(node.testId) };
  }

  if (node.elementId !== undefined && node.elementId.trim().length > 0) {
    return { strategy: "css", value: truncateLocatorValue(cssEscapeIdentifier(node.elementId.trim())) };
  }

  const actionKind = inferActionKind(node);

  if (actionKind === "checkbox") {
    if (node.elementId !== undefined && node.elementId.trim().length > 0) {
      return {
        strategy: "css",
        value: truncateLocatorValue(cssEscapeIdentifier(node.elementId.trim())),
      };
    }
    if (node.name !== undefined && node.name.trim().length > 0) {
      return {
        strategy: "css",
        value: truncateLocatorValue(
          `input[type="checkbox"][name="${node.name.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"]`,
        ),
      };
    }
  }

  if (node.name !== undefined && node.name.trim().length > 0 && !isWeakAccessibleName(node.name)) {
    return { strategy: "css", value: truncateLocatorValue(cssEscapeName(node.name.trim())) };
  }

  if (node.ariaLabel !== undefined && node.ariaLabel.trim().length > 0) {
    return { strategy: "label", value: truncateLocatorValue(node.ariaLabel) };
  }

  if (node.placeholder !== undefined && node.placeholder.trim().length > 0) {
    return { strategy: "placeholder", value: truncateLocatorValue(node.placeholder) };
  }

  const text = node.text?.trim();
  const role = node.role?.toLowerCase();

  if (
    text !== undefined &&
    text.length > 0 &&
    text.length < 120 &&
    !isWeakAccessibleName(text) &&
    (actionKind === "button" || actionKind === "link")
  ) {
    return {
      strategy: "role",
      role: actionKind === "link" ? "link" : "button",
      value: truncateLocatorValue(text),
    };
  }

  if (
    text !== undefined &&
    text.length > 0 &&
    text.length < 120 &&
    actionKind === "textbox" &&
    !isWeakAccessibleName(text)
  ) {
    return { strategy: "label", value: truncateLocatorValue(text) };
  }

  if (text !== undefined && text.length > 0 && text.length < 80 && !isWeakAccessibleName(text)) {
    return { strategy: "text", value: truncateLocatorValue(text) };
  }

  if (role !== undefined && INTERACTIVE_ROLES.has(role)) {
    const fallback = node.ariaLabel ?? node.placeholder ?? node.name ?? node.testId;
    if (fallback !== undefined && fallback.trim().length > 0 && !isWeakAccessibleName(fallback)) {
      return { strategy: "role", role, value: truncateLocatorValue(fallback) };
    }
  }

  return null;
}

function isInteractiveNode(node: DomNodeLike): boolean {
  const tag = node.tagName.toLowerCase();
  if (INTERACTIVE_TAGS.has(tag)) return true;
  if (node.role !== undefined && INTERACTIVE_ROLES.has(node.role.toLowerCase())) return true;
  if (node.testId !== undefined && node.testId.length > 0) return true;
  if (node.elementId !== undefined && node.elementId.length > 0) return true;
  return false;
}

function walkFlat(
  nodes: DomNodeLike[],
  out: ParsedDomElementScored[],
  seenLocators: Set<string>,
  usedKeys: Set<string>,
  prefix: string,
): void {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const nodeId = `${prefix}-${i}-${node.tagName}`;
    const locator = pickLocator(node);
    const interactive = node.isVisible && isInteractiveNode(node) && locator !== null;

    if (interactive && locator !== null) {
      const basis =
        node.testId ??
        node.elementId ??
        node.name ??
        node.ariaLabel ??
        node.text ??
        node.placeholder ??
        node.tagName;
      const suggestedKey = ensureUniqueElementKey(slugKey(basis), usedKeys);
      const dedupe = `${locator.strategy}:${locator.role ?? ""}:${locator.value}:${node.frame ?? ""}:${node.shadowHost ?? ""}`;
      if (!seenLocators.has(dedupe)) {
        seenLocators.add(dedupe);
        out.push({
          nodeId,
          tagName: node.tagName,
          suggestedKey,
          strategy: locator.strategy,
          value: locator.value,
          role: locator.role,
          frame: node.frame,
          shadowHost: node.shadowHost,
          actionKind: inferActionKind(node),
          _priority: locatorPriority(node, locator),
        });
      }
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      walkFlat(node.children, out, seenLocators, usedKeys, nodeId);
    }
  }
}

/** Parse DOM snapshot JSON produced by scripts/capture-dom.mjs. */
export function parseDomSnapshotPayloadDetailed(payload: unknown): ParseDomSnapshotResult {
  let nodes: DomNodeLike[] = [];
  if (Array.isArray(payload)) {
    nodes = payload as DomNodeLike[];
  } else if (payload !== null && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.nodes)) {
      nodes = obj.nodes as DomNodeLike[];
    } else if (Array.isArray(obj.elements)) {
      nodes = obj.elements as DomNodeLike[];
    }
  }

  const scored: ParsedDomElementScored[] = [];
  walkFlat(nodes, scored, new Set(), new Set(), "root");
  scored.sort((a, b) => b._priority - a._priority);

  const totalMatched = scored.length;
  const elements = scored
    .slice(0, MAX_PARSED_DOM_ELEMENTS)
    .map(({ _priority: _ignored, ...el }) => el);

  return {
    elements,
    totalMatched,
    truncated: totalMatched > MAX_PARSED_DOM_ELEMENTS,
  };
}

export function parseDomSnapshotPayload(payload: unknown): ParsedDomElement[] {
  return parseDomSnapshotPayloadDetailed(payload).elements;
}

/** True when JSON looks like a DOM snapshot (not mobile accessibility tree). */
export function isDomSnapshotPayload(payload: unknown): boolean {
  let sample: unknown;
  if (Array.isArray(payload)) {
    sample = payload[0];
  } else if (payload !== null && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    const arr = obj.nodes ?? obj.elements;
    if (Array.isArray(arr) && arr.length > 0) {
      sample = arr[0];
    }
  }
  return (
    sample !== null &&
    typeof sample === "object" &&
    "tagName" in (sample as Record<string, unknown>) &&
    !("type" in (sample as Record<string, unknown>) && "isEnabled" in (sample as Record<string, unknown>))
  );
}
