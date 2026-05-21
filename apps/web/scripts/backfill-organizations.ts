/**
 * One-time helper after adding organizations: creates a legacy org for existing projects
 * if no organizations exist yet. Run: npm run db:backfill (from apps/web)
 */
import { PrismaClient } from "@prisma/client";
import { uniqueOrganizationSlug } from "../src/lib/auth/org-slug";

const prisma = new PrismaClient();

async function main() {
  const projectCount = await prisma.project.count();
  if (projectCount === 0) {
    console.log("No projects — nothing to backfill.");
    return;
  }

  const orgCount = await prisma.organization.count();
  if (orgCount > 0) {
    console.log("Organizations already exist — skip backfill.");
    return;
  }

  const slug = await uniqueOrganizationSlug("legacy", async (candidate) => {
    const row = await prisma.organization.findUnique({ where: { slug: candidate }, select: { id: true } });
    return row !== null;
  });

  const org = await prisma.organization.create({
    data: { name: "Legacy workspace", slug, disabled: false },
  });

  const updated = await prisma.project.updateMany({
    data: { organizationId: org.id },
  });

  console.log(`Created organization "${org.name}" and linked ${updated.count} project(s).`);
  console.log("Create a user account and add yourself as org owner via Prisma Studio if needed.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
