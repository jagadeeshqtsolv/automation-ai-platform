import { redirect } from "next/navigation";
import { getAccessibleProject } from "@/lib/auth/access";
import type { AuthUser } from "@/lib/auth/current-user";
import { getCurrentUser } from "@/lib/auth/current-user";

export async function requirePageUser(nextPath?: string): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (user === null) {
    const query = nextPath !== undefined ? `?next=${encodeURIComponent(nextPath)}` : "";
    redirect(`/login${query}`);
  }
  return user;
}

export async function requireAccessibleProjectPage(projectId: string) {
  const user = await requirePageUser(`/projects/${projectId}`);
  const project = await getAccessibleProject(user.id, projectId);
  if (project === null) {
    redirect("/dashboard");
  }
  return { user, project };
}
