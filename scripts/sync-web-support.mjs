#!/usr/bin/env node
/**
 * Syncs the locally-built packages/core/web dist into:
 *   frameworks/_shared-web/node_modules/@automation-ai/web-support/
 *   frameworks/web/<id>/node_modules/@automation-ai/web-support/   (all projects)
 *
 * Usage:
 *   node scripts/sync-web-support.mjs            # one-shot sync
 *   node scripts/sync-web-support.mjs --watch    # watch dist and auto-sync on change
 */

import { cp, mkdir, readdir } from "node:fs/promises";
import { existsSync, watch } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const SRC_DIST    = path.join(root, "packages/core/web/dist");
const SRC_SCRIPT  = path.join(root, "packages/core/web/scripts/capture-dom.mjs");
const FRAMEWORKS  = path.join(root, "frameworks");

const bold  = (s) => `\x1b[1m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red   = (s) => `\x1b[31m${s}\x1b[0m`;
const dim   = (s) => `\x1b[2m${s}\x1b[0m`;

async function syncToTarget(targetRoot) {
  const webSupport = path.join(targetRoot, "node_modules/@automation-ai/web-support");
  if (!existsSync(webSupport)) return false; // project not installed yet

  const dstDist    = path.join(webSupport, "dist");
  const dstScripts = path.join(webSupport, "scripts");

  await cp(SRC_DIST, dstDist, { recursive: true, force: true });
  await mkdir(dstScripts, { recursive: true });
  await cp(SRC_SCRIPT, path.join(dstScripts, "capture-dom.mjs"), { force: true });
  return true;
}

async function syncAll() {
  if (!existsSync(SRC_DIST)) {
    console.error(red("[sync] packages/core/web/dist not found — run: npm run build --workspace=@jagadeeshqtsolv/web-support"));
    return;
  }

  const ts = new Date().toLocaleTimeString();
  console.log(`${dim(ts)} ${bold("[web-support sync]")} syncing…`);

  const targets = [];

  // Shared cache
  const shared = path.join(FRAMEWORKS, "_shared-web");
  if (existsSync(shared)) targets.push(shared);

  // All web project frameworks
  const webDir = path.join(FRAMEWORKS, "web");
  if (existsSync(webDir)) {
    for (const entry of await readdir(webDir, { withFileTypes: true })) {
      if (entry.isDirectory()) targets.push(path.join(webDir, entry.name));
    }
  }

  if (targets.length === 0) {
    console.log(dim("  no installed framework projects found — nothing to sync"));
    return;
  }

  let synced = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        const ok = await syncToTarget(t);
        if (ok) {
          synced++;
          console.log(`  ${green("✓")} ${path.relative(root, t)}`);
        }
      } catch (err) {
        console.error(`  ${red("✗")} ${path.relative(root, t)}: ${err.message}`);
      }
    }),
  );

  console.log(`${dim(new Date().toLocaleTimeString())} ${bold("[web-support sync]")} done — ${synced} project(s) updated`);
}

const watchMode = process.argv.includes("--watch");

await syncAll();

if (watchMode) {
  console.log(dim(`[web-support sync] watching ${path.relative(root, SRC_DIST)} for changes…\n`));

  let debounce = null;
  watch(SRC_DIST, { recursive: true }, () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => void syncAll(), 400);
  });
}
