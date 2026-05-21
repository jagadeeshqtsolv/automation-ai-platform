/**
 * Create the first platform admin (invite-only deployments).
 * Run from apps/web: npm run db:create-admin -- --email admin@example.com --password 'your-secure-password'
 */
import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";

const prisma = new PrismaClient();

function readArg(flag: string): string | null {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) {
    return null;
  }
  return process.argv[idx + 1] ?? null;
}

async function main() {
  const email = readArg("--email")?.trim().toLowerCase();
  const password = readArg("--password");
  const name = readArg("--name")?.trim() ?? null;

  if (email === null || email === undefined || email.length === 0) {
    console.error("Usage: npm run db:create-admin -- --email you@company.com --password 'secret' [--name 'Admin']");
    process.exit(1);
  }
  if (password === undefined || password === null || password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, isPlatformAdmin: true } });
  if (existing !== null) {
    if (existing.isPlatformAdmin) {
      console.log(`User ${email} is already a platform admin.`);
      return;
    }
    await prisma.user.update({
      where: { id: existing.id },
      data: { isPlatformAdmin: true },
    });
    console.log(`Promoted existing user ${email} to platform admin.`);
    return;
  }

  const passwordHash = await hashPassword(password);
  await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      isPlatformAdmin: true,
    },
  });

  console.log(`Created platform admin: ${email}`);
  console.log("Sign in at /login, then open /admin to create organizations and send invites.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
