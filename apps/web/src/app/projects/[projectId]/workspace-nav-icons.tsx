import type { WorkspaceTab } from "./project-workspace-nav";

type IconProps = { className?: string };

const iconClass = "h-[18px] w-[18px]";

export function WorkspaceTabIcon({ tab, active }: { tab: WorkspaceTab; active: boolean }) {
  const shell = active
    ? "border-slate-300 shadow-sm ring-1 ring-slate-100"
    : "border-slate-200 group-hover:border-slate-300";

  return (
    <span
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-gradient-to-br transition duration-200 ${shell} ${iconTone(tab)}`}
      aria-hidden
    >
      {iconGlyph(tab)}
    </span>
  );
}

function iconTone(tab: WorkspaceTab): string {
  const tones: Record<WorkspaceTab, string> = {
    overview: "from-slate-100 to-slate-200 text-slate-600",
    setup: "from-violet-100 to-indigo-100 text-violet-700",
    requirements: "from-sky-100 to-blue-100 text-sky-700",
    recorder: "from-rose-100 to-orange-100 text-rose-700",
    "generate-pom": "from-amber-100 to-yellow-100 text-amber-700",
    "test-plans": "from-emerald-100 to-teal-100 text-emerald-700",
    "test-execution": "from-green-100 to-emerald-100 text-green-700",
    "test-reports": "from-cyan-100 to-sky-100 text-cyan-700",
    "smart-import": "from-green-100 to-emerald-100 text-green-700",
    framework: "from-orange-100 to-amber-100 text-orange-700",
  };
  return tones[tab];
}

function iconGlyph(tab: WorkspaceTab) {
  switch (tab) {
    case "overview":
      return <OverviewIcon className={iconClass} />;
    case "setup":
      return <SetupIcon className={iconClass} />;
    case "requirements":
      return <RequirementsIcon className={iconClass} />;
    case "recorder":
      return <RecorderIcon className={iconClass} />;
    case "generate-pom":
      return <PageObjectsIcon className={iconClass} />;
    case "test-plans":
      return <TestPlansIcon className={iconClass} />;
    case "test-execution":
      return <ExecutionIcon className={iconClass} />;
    case "test-reports":
      return <ReportsIcon className={iconClass} />;
    case "smart-import":
      return <SmartImportIcon className={iconClass} />;
    case "framework":
      return <FrameworkIcon className={iconClass} />;
  }
}

function OverviewIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="5" rx="2" />
      <rect x="13" y="10" width="8" height="11" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
    </svg>
  );
}

function SetupIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        strokeLinecap="round"
        d="M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6l1.4 1.4m10 10l1.4 1.4m0-12.8-1.4 1.4m-10 10-1.4 1.4"
      />
      <circle cx="12" cy="12" r="3.25" />
    </svg>
  );
}

function RequirementsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path strokeLinecap="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
      <path strokeLinecap="round" d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
      <path strokeLinecap="round" d="M9 12h6M9 16h4" />
    </svg>
  );
}

function RecorderIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
      <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="6" r="2.25" fill="#f43f5e" stroke="none" className="drop-shadow-sm" />
    </svg>
  );
}

function PageObjectsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path strokeLinecap="round" d="M4 7h16M4 12h10M4 17h14" />
      <rect x="15" y="10" width="5" height="5" rx="1" fill="currentColor" fillOpacity="0.15" />
      <rect x="15" y="10" width="5" height="5" rx="1" />
    </svg>
  );
}

function TestPlansIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path strokeLinecap="round" d="M9 6h11M9 12h11M9 18h11" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 6l1.25 1.25L8.5 5M5 12l1.25 1.25L8.5 11M5 18l1.25 1.25L8.5 17" />
    </svg>
  );
}

function ExecutionIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M8 5v14l11-7L8 5z"
        fill="currentColor"
        fillOpacity="0.2"
      />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5v14l11-7L8 5z" />
    </svg>
  );
}

function ReportsIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path strokeLinecap="round" d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path strokeLinecap="round" d="M14 4v4h4M8 12h8M8 16h5" />
    </svg>
  );
}

function SmartImportIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16v-8m0 0l-3 3m3-3l3 3" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5V19a1 1 0 001 1h16a1 1 0 001-1v-2.5" />
      <rect x="4" y="4" width="7" height="5" rx="1" />
      <rect x="13" y="4" width="7" height="5" rx="1" />
    </svg>
  );
}

function FrameworkIcon({ className }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path strokeLinecap="round" d="M4 7.5V18a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7.5" />
      <path strokeLinecap="round" d="M3 7.5h18l-2-3.5H5L3 7.5z" />
      <path strokeLinecap="round" d="M10 11.5h4" />
    </svg>
  );
}

/** Compact icon for mobile tab strip */
export function WorkspaceTabIconCompact({ tab }: { tab: WorkspaceTab }) {
  return (
    <span
      className={`inline-flex h-5 w-5 items-center justify-center rounded-md bg-slate-50 ${iconTone(tab).split(" ").slice(-1).join(" ")}`}
      aria-hidden
    >
      <span className="scale-90">{iconGlyph(tab)}</span>
    </span>
  );
}
