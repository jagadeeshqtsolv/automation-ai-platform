import type { ScreenElement } from "@automation-ai/core";

export type ViewNodeLike = {
  type: string;
  label?: string;
  identifier?: string;
  resourceId?: string;
  value?: string;
  text?: string;
  placeholder?: string;
  isVisible: boolean;
  isEnabled?: boolean;
  children?: ViewNodeLike[];
};

export type ParsedTreeElement = {
  nodeId: string;
  type: string;
  label?: string;
  suggestedKey: string;
  strategy: ScreenElement["strategy"];
  value: string;
  role?: string;
};

const INTERACTIVE_TYPES = new Set([
  "Button",
  "TextField",
  "SecureTextField",
  "SearchField",
  "Switch",
  "Link",
  "Cell",
  "Image",
  "StaticText",
  "Text",
  "EditText",
  "android.widget.Button",
  "android.widget.EditText",
  "android.widget.TextView",
]);

function slugKey(raw: string): string {
  const cleaned = raw
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter((p) => p.length > 0)
    .map((p, i) => (i === 0 ? p.toLowerCase() : p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()))
    .join("");
  if (cleaned.length === 0) return "element";
  if (/^\d/.test(cleaned)) return `el${cleaned}`;
  return cleaned;
}

function pickLocator(node: ViewNodeLike): Pick<ScreenElement, "strategy" | "value" | "role"> | null {
  if (node.identifier && node.identifier.trim().length > 0) {
    return { strategy: "testId", value: node.identifier.trim() };
  }
  if (node.resourceId && node.resourceId.trim().length > 0) {
    const id = node.resourceId.trim();
    const short = id.includes("/") ? (id.split("/").pop() ?? id) : id;
    return { strategy: "testId", value: short };
  }
  if (node.label && node.label.trim().length > 0) {
    return { strategy: "label", value: node.label.trim() };
  }
  if (node.placeholder && node.placeholder.trim().length > 0) {
    return { strategy: "placeholder", value: node.placeholder.trim() };
  }
  const text = (node.text ?? node.value)?.trim();
  if (text && text.length > 0 && text.length < 120) {
    return { strategy: "text", value: text };
  }
  if (node.type.toLowerCase().includes("button") && node.label) {
    return { strategy: "role", value: node.label, role: "button" };
  }
  return null;
}

function walk(nodes: ViewNodeLike[], out: ParsedTreeElement[], seen: Set<string>, prefix: string): void {
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const nodeId = `${prefix}-${i}-${node.type}`;
    const locator = pickLocator(node);
    const isInteractive = INTERACTIVE_TYPES.has(node.type) || locator !== null;

    if (node.isVisible && isInteractive && locator !== null) {
      const basis = node.identifier ?? node.label ?? node.text ?? node.resourceId ?? node.type;
      const suggestedKey = slugKey(basis);
      const dedupe = `${locator.strategy}:${locator.value}`;
      if (!seen.has(dedupe)) {
        seen.add(dedupe);
        out.push({
          nodeId,
          type: node.type,
          label: node.label ?? node.text,
          suggestedKey,
          strategy: locator.strategy,
          value: locator.value,
          role: locator.role,
        });
      }
    }

    if (Array.isArray(node.children) && node.children.length > 0) {
      walk(node.children, out, seen, nodeId);
    }
  }
}

export function parseViewTreePayload(payload: unknown): ParsedTreeElement[] {
  let nodes: ViewNodeLike[] = [];
  if (Array.isArray(payload)) {
    nodes = payload as ViewNodeLike[];
  } else if (payload !== null && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.nodes)) {
      nodes = obj.nodes as ViewNodeLike[];
    } else if (Array.isArray(obj.tree)) {
      nodes = obj.tree as ViewNodeLike[];
    }
  }

  const out: ParsedTreeElement[] = [];
  walk(nodes, out, new Set(), "root");
  return out;
}
