/** Injected into frameworks/web/<projectId>/scripts/capture-dom.mjs */
export const CAPTURE_DOM_SCRIPT_SOURCE = `import { chromium, firefox, webkit } from "playwright";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const mode = process.argv[2] ?? "start";
const sessionPath = "environments/.recorder-session.json";
const signalPath = "environments/.recorder-capture.signal";
const stopPath = "environments/.recorder-stop.signal";
const pidPath = "environments/.recorder.pid";

const session = JSON.parse(readFileSync(sessionPath, "utf8"));
const baseURL = session.baseURL ?? "https://example.com";
const startPath = session.startPath ?? "/";
const browserName = session.browser ?? "chromium";
const headless = session.headless === true;

const launchers = { chromium, firefox, webkit };
const launcher = launchers[browserName] ?? chromium;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function collectDomNodes() {
  const INTERACTIVE_TAGS = new Set(["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"]);
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
  const collected = [];

  function isVisible(el) {
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
      return false;
    }
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function shortText(el) {
    const label = el.getAttribute("aria-label");
    if (label && label.trim().length > 0 && label.length < 120) return label.trim();
    const text = (el.innerText ?? el.textContent ?? "").trim().replace(/\\s+/g, " ");
    if (text.length > 0 && text.length < 120) return text;
    return undefined;
  }

  function implicitRole(el) {
    const explicit = el.getAttribute("role");
    if (explicit) return explicit;
    const tag = el.tagName;
    if (tag === "BUTTON") return "button";
    if (tag === "A") return "link";
    if (tag === "INPUT") {
      const type = (el.getAttribute("type") ?? "text").toLowerCase();
      if (type === "checkbox") return "checkbox";
      if (type === "radio") return "radio";
      if (type === "search") return "searchbox";
      return "textbox";
    }
    if (tag === "SELECT") return "combobox";
    if (tag === "TEXTAREA") return "textbox";
    return undefined;
  }

  function isInteractive(el) {
    if (INTERACTIVE_TAGS.has(el.tagName)) return true;
    const role = implicitRole(el);
    return role !== undefined && INTERACTIVE_ROLES.has(role);
  }

  function iframeSelector(el) {
    if (el.id && el.id.length > 0) return "iframe#" + el.id;
    const name = el.getAttribute("name");
    if (name && name.length > 0) return 'iframe[name="' + name.replace(/"/g, '\\\\"') + '"]';
    return "iframe";
  }

  function shadowHostSelector(el) {
    if (el.id && el.id.length > 0) return "#" + el.id;
    return el.tagName.toLowerCase();
  }

  function captureInteractive(el, ctx) {
    if (!isVisible(el) || !isInteractive(el)) return;
    const tagName = el.tagName.toLowerCase();
    const role = implicitRole(el);
    const testId = el.getAttribute("data-testid") ?? el.getAttribute("data-test-id") ?? undefined;
    const elementId = el.id && el.id.length > 0 ? el.id : undefined;
    const name = el.getAttribute("name") ?? undefined;
    const ariaLabel = el.getAttribute("aria-label") ?? undefined;
    const placeholder = el.placeholder || undefined;
    const text = shortText(el);
    const inputType = el.tagName === "INPUT" ? el.getAttribute("type") ?? undefined : undefined;
    collected.push({
      tagName,
      testId: testId ?? undefined,
      elementId: elementId ?? undefined,
      name: name ?? undefined,
      ariaLabel: ariaLabel ?? undefined,
      placeholder: placeholder ?? undefined,
      text: text ?? undefined,
      role: role ?? undefined,
      inputType: inputType ?? undefined,
      frame: ctx.frame,
      shadowHost: ctx.shadowHost,
      isVisible: true,
    });
  }

  function walk(el, ctx) {
    captureInteractive(el, ctx);

    if (el.shadowRoot) {
      for (const child of el.shadowRoot.children) {
        walk(child, { ...ctx, shadowHost: shadowHostSelector(el) });
      }
    }

    if (el.tagName === "IFRAME") {
      try {
        const doc = el.contentDocument;
        if (doc && doc.body) {
          walk(doc.body, { frame: iframeSelector(el), shadowHost: undefined });
        }
      } catch {
        // cross-origin iframe — cannot traverse
      }
    }

    for (const child of el.children) {
      walk(child, ctx);
    }
  }

  const body = document.body;
  if (!body) return [];
  walk(body, {});
  return collected;
}

async function writeSnapshot(page) {
  const nodes = await page.evaluate(collectDomNodes);
  const payload = {
    capturedAt: new Date().toISOString(),
    url: page.url(),
    baseURL,
    nodes,
  };
  writeFileSync("environments/latest-dom-snapshot.json", JSON.stringify(payload, null, 2));
  return payload;
}

const browser = await launcher.launch({ headless });
const context = await browser.newContext({ baseURL });
const page = await context.newPage();
await page.goto(startPath);

if (mode === "start") {
  writeFileSync(pidPath, String(process.pid));
  for (const p of [signalPath, stopPath]) {
    if (existsSync(p)) {
      try {
        unlinkSync(p);
      } catch {
        // ignore
      }
    }
  }

  console.error(
    "[recorder] Browser is open — navigate freely, then click Capture current page in the app (no Playwright Inspector).",
  );

  while (!existsSync(stopPath)) {
    if (existsSync(signalPath)) {
      try {
        unlinkSync(signalPath);
      } catch {
        // ignore
      }
      const payload = await writeSnapshot(page);
      console.log(JSON.stringify(payload));
      console.error("[recorder] DOM captured. Navigate to another page and capture again, or close the browser from the app.");
    }
    await sleep(350);
  }

  try {
    unlinkSync(stopPath);
  } catch {
    // ignore
  }
  try {
    unlinkSync(pidPath);
  } catch {
    // ignore
  }
  await browser.close();
  process.exit(0);
}

// Legacy one-shot (no Inspector): wait up to 30 minutes for a signal file, then capture once.
console.error("[recorder] Browser opened. Waiting for capture signal…");
const deadline = Date.now() + 30 * 60 * 1000;
let payload = null;
while (Date.now() < deadline) {
  if (existsSync(signalPath)) {
    try {
      unlinkSync(signalPath);
    } catch {
      // ignore
    }
    payload = await writeSnapshot(page);
    break;
  }
  await sleep(350);
}
if (payload === null) {
  console.error("[recorder] Timed out waiting for capture signal.");
  await browser.close();
  process.exit(1);
}
console.log(JSON.stringify(payload));
await browser.close();
`;
