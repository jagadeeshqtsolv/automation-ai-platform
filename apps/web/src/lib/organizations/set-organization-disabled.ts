import { prisma } from "@/lib/prisma";

export async function setOrganizationDisabled(
  organizationId: string,
  disabled: boolean,
): Promise<"updated" | "not_found"> {
  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });

  if (org === null) {
    return "not_found";
  }

  await prisma.organization.update({
    where: { id: org.id },
    data: { disabled },
  });

  return "updated";
}
