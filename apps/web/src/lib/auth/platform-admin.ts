import { prisma } from "@/lib/prisma";

export async function userIsPlatformAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true },
  });
  return user?.isPlatformAdmin === true;
}
