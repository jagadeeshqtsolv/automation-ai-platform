import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { BRAND_NAME } from "@/lib/brand";
import { requireAccessibleProjectPage } from "@/lib/auth/page-guards";
import { getOrganizationMembership } from "@/lib/auth/access";
import { ProjectHeaderActions } from "./project-header-actions";
import { ProjectWorkspace } from "./workspace";

const paramsSchema = z.object({
  projectId: z.string().uuid(),
});

export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const raw = await params;
  const parsed = paramsSchema.safeParse(raw);
  if (!parsed.success) {
    notFound();
  }

  const { user, project } = await requireAccessibleProjectPage(parsed.data.projectId);
  const membership = await getOrganizationMembership(user.id, project.organizationId);
  const isOwner = membership?.role === "owner";

  return (
    <div className="ui-page py-8 sm:py-10">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <p className="ui-eyebrow">{BRAND_NAME} · Project</p>
          <h1 className="ui-title-lg">{project.name}</h1>
          <p className="ui-subtitle">Created {new Date(project.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard" className="ui-btn-secondary">
            All projects
          </Link>
          {isOwner && <ProjectHeaderActions projectId={project.id} projectName={project.name} />}
        </div>
      </div>

      <div className="mt-8 animate-slide-up sm:mt-10">
        <ProjectWorkspace projectId={project.id} />
      </div>
    </div>
  );
}
