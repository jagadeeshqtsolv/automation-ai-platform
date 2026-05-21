import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

/**
 * Optional catch-all `[[...path]]` may receive `[""]` when the URL ends with `/` and no file segments
 * follow (e.g. `.../playwright-report/`). Treat that as "serve index.html", not an invalid empty path.
 */
export function relativeFileFromOptionalCatchAll(
  segments: string[] | undefined,
  indexFileName = "index.html",
): string {
  const cleaned =
    segments === undefined ? [] : segments.map((s) => s.trim()).filter((s) => s.length > 0);
  return cleaned.length === 0 ? indexFileName : cleaned.join("/");
}

function mimeFor(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".woff2":
      return "font/woff2";
    case ".woff":
      return "font/woff";
    case ".ttf":
      return "font/ttf";
    case ".ico":
      return "image/x-icon";
    default:
      return "application/octet-stream";
  }
}

/**
 * Playwright report assets use relative `./data/...`. Browsers only resolve that correctly when the
 * document URL is under the report folder as a **file** path ending in `index.html`. Redirect bare
 * `.../playwright-report` and `.../playwright-report/` to `.../playwright-report/index.html`.
 */
export function redirectToReportDirIfNeeded(requestUrl: string, reportPathSegment: string): NextResponse | null {
  try {
    const u = new URL(requestUrl);
    const idx = u.pathname.indexOf(reportPathSegment);
    if (idx < 0) {
      return null;
    }
    const prefix = u.pathname.slice(0, idx + reportPathSegment.length);
    const canonical = `${prefix}/index.html`;
    if (u.pathname === canonical) {
      return null;
    }
    if (u.pathname === `${canonical}/`) {
      u.pathname = canonical;
      return NextResponse.redirect(u, 308);
    }
    const after = u.pathname.slice(idx + reportPathSegment.length);
    if (after === "" || after === "/") {
      u.pathname = canonical;
      return NextResponse.redirect(u, 308);
    }
  } catch {
    return null;
  }
  return null;
}

function reportBaseHref(requestUrl: string): string {
  const u = new URL(requestUrl);
  let p = u.pathname;
  if (p.endsWith("/index.html")) {
    p = p.slice(0, -"/index.html".length);
  }
  if (!p.endsWith("/")) {
    p = `${p}/`;
  }
  return `${u.origin}${p}`;
}

function injectHtmlBaseIfNeeded(html: string, requestUrl: string): string {
  if (/<base\s+href=/i.test(html)) {
    return html;
  }
  const href = reportBaseHref(requestUrl);
  const injected = `<base href="${href.replace(/"/g, "&quot;")}">`;
  const headOpen = /<head[^>]*>/i.exec(html);
  if (headOpen !== null && headOpen.index !== undefined) {
    const i = headOpen.index + headOpen[0].length;
    return `${html.slice(0, i)}\n${injected}\n${html.slice(i)}`;
  }
  return `<!DOCTYPE html><html><head>${injected}</head><body>${html}</body></html>`;
}

export async function readReportFileResponse(params: {
  absoluteFilePath: string;
  requestUrl: string;
}): Promise<NextResponse> {
  const buf = await readFile(params.absoluteFilePath);
  const isIndex = path.basename(params.absoluteFilePath).toLowerCase() === "index.html";
  if (isIndex) {
    const body = injectHtmlBaseIfNeeded(buf.toString("utf8"), params.requestUrl);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "private, max-age=60",
      },
    });
  }
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mimeFor(params.absoluteFilePath),
      "Cache-Control": "private, max-age=120",
    },
  });
}
