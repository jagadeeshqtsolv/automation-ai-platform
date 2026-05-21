import { QuarksLogoMark } from "@/components/quarks-logo-mark";
import { BRAND_NAME } from "@/lib/brand";
import { DashboardWorkspace } from "./dashboard-workspace";

export default function DashboardPage() {
  return (
    <div className="ui-page max-w-6xl py-8 sm:py-10">
      <header className="border-b border-white/[0.08] pb-8">
        <div className="flex items-center gap-3">
          <QuarksLogoMark size="md" />
          <div>
            <p className="ui-eyebrow text-accent">{BRAND_NAME}</p>
            <h1 className="ui-title-lg">Dashboard</h1>
            <p className="ui-subtitle mt-1 max-w-xl">
              Workspace analytics across projects, requirements, environments, page objects, and generated tests.
            </p>
          </div>
        </div>
      </header>

      <div className="mt-8 animate-slide-up sm:mt-10">
        <DashboardWorkspace />
      </div>
    </div>
  );
}
