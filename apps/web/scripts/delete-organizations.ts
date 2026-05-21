import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return null;
  }
  return process.argv[idx + 1] ?? null;
}

function readSlugs(): string[] {
  const slugs: string[] = [];
  process.argv.forEach((arg, index) => {
    if (arg === "--slug" && index + 1 < process.argv.length) {
      slugs.push(process.argv[index + 1].trim().toLowerCase());
    }
  });
  return slugs;
}

async function main() {
  const slugs = readSlugs();
  const targets = slugs.length > 0 ? slugs : ["ukg", "airlinq"];

  console.log("Deleting organizations by slug:", targets.join(", "));

  const organizations = await prisma.organization.findMany({
    where: {
      slug: { in: targets },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (organizations.length === 0) {
    console.log("No matching organizations found. No rows were deleted.");
    return;
  }

  const deleted = await prisma.organization.deleteMany({
    where: {
      slug: { in: targets },
    },
  });

  const missingSlugs = targets.filter(
    (slug) => !organizations.some((org) => org.slug === slug),
  );

  for (const org of organizations) {
    console.log(`Deleted organization: ${org.name} (${org.slug})`);
  }
  if (missingSlugs.length > 0) {
    console.log(`No organization found for slug(s): ${missingSlugs.join(", ")}`);
  }

  console.log(`Deleted ${deleted.count} organization(s) (cascading related projects and members).`);
  console.log("If this is a local database, make sure DATABASE_URL is pointing at the intended file or connection string.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
