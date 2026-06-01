import { DashboardWorkspace } from "./dashboard-workspace";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1600px] px-3 py-4 sm:px-5 sm:py-6">
      <div className="animate-slide-up">
        <DashboardWorkspace />
      </div>
    </div>
  );
}
