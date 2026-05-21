import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return null;
  }
  return process.argv[idx + 1] ?? null;
}

function buildSearchCondition(term: string) {
  const normalized = term.trim();
  return {
    OR: [
      { email: { contains: normalized, mode: "insensitive" } },
      { name: { contains: normalized, mode: "insensitive" } },
    ],
  };
}

async function main() {
  const email = readArg("--email");
  const name = readArg("--name");
  const query = readArg("--query");

  const searchTerm = email ?? name ?? query ?? "dileepan";
  console.log(`Searching for users matching: ${searchTerm}`);

  const where = email
    ? { email: { equals: email, mode: "insensitive" } }
    : name
      ? { name: { contains: name, mode: "insensitive" } }
      : buildSearchCondition(searchTerm);

  const users = await prisma.user.findMany({ where });

  if (users.length === 0) {
    console.log("No matching users found. Nothing was deleted.");
    return;
  }

  const deleted = await prisma.user.deleteMany({ where });

  for (const user of users) {
    console.log(`Deleted user: ${user.email}${user.name ? ` (${user.name})` : ""}`);
  }

  console.log(`Deleted ${deleted.count} user(s).`);
  console.log("If this is a local database, confirm DATABASE_URL points at the intended file.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
