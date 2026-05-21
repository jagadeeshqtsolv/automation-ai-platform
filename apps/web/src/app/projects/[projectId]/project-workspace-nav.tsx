"use client";

import { BRAND_NAME } from "@/lib/brand";
import { QuarksLogoMark } from "@/components/quarks-logo-mark";
import { WorkspaceTabIcon, WorkspaceTabIconCompact } from "./workspace-nav-icons";

export type WorkspaceTab =
  | "overview"
  | "setup"
  | "requirements"
  | "recorder"
  | "generate-pom"
  | "test-plans"
  | "test-execution"
  | "test-reports"
  | "framework";

export type WorkspaceNavItem = {
  id: WorkspaceTab;
  label: string;
  description: string;
  badge?: number;
};

export function ProjectWorkspaceNav({
  items,
  active,
  onChange,
}: {
  items: WorkspaceNavItem[];
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
}) {
  return (
    <>
      <nav className="ui-nav-rail" aria-label="Project workspace">
        <div className="mb-4 flex items-center gap-2.5 px-2">
          <QuarksLogoMark size="sm" variant="mark" className="!h-8 !w-8 !rounded-lg !p-0.5" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Workspace</p>
            <p className="text-xs font-medium text-zinc-300">{BRAND_NAME}</p>
          </div>
        </div>
        <ul className="ui-nav-list">
          {items.map((item) => (
            <NavButton key={item.id} item={item} active={active === item.id} onClick={() => onChange(item.id)} />
          ))}
        </ul>
      </nav>

      <div
        className="flex gap-2 overflow-x-auto border-b border-white/[0.08] pb-3 lg:hidden"
        role="tablist"
        aria-label="Project sections"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            onClick={() => onChange(item.id)}
            className={`inline-flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition duration-200 ${
              active === item.id
                ? "border border-accent/50 bg-accent text-midnight-950 shadow-md shadow-accent/30"
                : "border border-white/[0.1] bg-white/[0.04] text-zinc-300 hover:bg-white/[0.08]"
            }`}
          >
            <WorkspaceTabIconCompact tab={item.id} />
            <span>
              {item.label}
              {item.badge !== undefined ? ` · ${item.badge}` : ""}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function NavButton({
  item,
  active,
  onClick,
}: {
  item: WorkspaceNavItem;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onClick}
        className={`group ui-nav-item ${active ? "ui-nav-item-active" : "ui-nav-item-inactive"}`}
      >
        <span className="flex gap-3">
          <WorkspaceTabIcon tab={item.id} active={active} />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold tracking-tight">{item.label}</span>
              {item.badge !== undefined ? (
                <span
                  className={`min-w-[1.25rem] rounded-md px-1.5 py-0.5 text-center text-[10px] font-bold tabular-nums ${
                    active ? "bg-accent/20 text-accent-muted" : "bg-white/[0.06] text-zinc-500"
                  }`}
                >
                  {item.badge}
                </span>
              ) : null}
            </span>
            <span
              className={`mt-0.5 block text-[11px] leading-snug ${
                active ? "text-accent-muted/80" : "text-zinc-500"
              }`}
            >
              {item.description}
            </span>
          </span>
        </span>
      </button>
    </li>
  );
}
