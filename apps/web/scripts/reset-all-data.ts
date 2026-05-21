/**
 * Deletes all users, organizations, projects, and related DB rows.
 * Also removes local framework folders under repo frameworks/.
 * Run: npm run db:reset (from apps/web)
 */
import { PrismaClient } from "@prisma/client";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const prisma = new PrismaClient();

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const frameworksRoot = path.resolve(scriptDir, "../../../frameworks");

async function clearFrameworkFolders(): Promise<number> {
  let removed = 0;
  let entries: string[];
  try {
    entries = await readdir(frameworksRoot);
  } catch {
    return 0;
  }

  for (const entry of entries) {
    const fullPath = path.join(frameworksRoot, entry);
    await rm(fullPath, { recursive: true, force: true });
    removed += 1;
  }
  return removed;
}

async function main() {
  const [orgs, users] = await prisma.$transaction([
    prisma.organization.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  const frameworkDirs = await clearFrameworkFolders();

  console.log(`Deleted ${orgs.count} organization(s) (and cascaded projects, requirements, etc.).`);
  console.log(`Deleted ${users.count} user(s).`);
  console.log(`Removed ${frameworkDirs} framework folder(s) from disk.`);
  console.log("Database is empty. Run: npm run db:create-admin -- --email you@company.com --password 'your-password'");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
