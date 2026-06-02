"use client";

import type React from "react";
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
  | "smart-import"
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
  bottomSlot,
}: {
  items: WorkspaceNavItem[];
  active: WorkspaceTab;
  onChange: (tab: WorkspaceTab) => void;
  bottomSlot?: React.ReactNode;
}) {
  return (
    <>
      <nav className="ui-nav-rail sticky top-6 self-start rounded-xl border border-slate-200 bg-white px-3 py-4 shadow-sm" aria-label="Project workspace">
        <div className="mb-4 flex items-center gap-2.5 border-b border-slate-100 pb-4">
          <QuarksLogoMark size="sm" variant="mark" className="!h-8 !w-8 !rounded-lg !p-0.5" />
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">Workspace</p>
            <p className="text-xs font-medium text-slate-600">{BRAND_NAME}</p>
          </div>
        </div>
        <ul className="ui-nav-list">
          {items.map((item) => (
            <NavButton key={item.id} item={item} active={active === item.id} onClick={() => onChange(item.id)} />
          ))}
          {bottomSlot ? (
            <li className="pt-2">{bottomSlot}</li>
          ) : null}
        </ul>
      </nav>

      <div
        className="flex gap-2 overflow-x-auto border-b border-slate-200 pb-3 lg:hidden"
        role="tablist"
        aria-label="Project Sections"
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
                ? "border border-accent/50 bg-accent text-slate-900 shadow-md shadow-accent/30"
                : "border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-50"
            }`}
          >
            <WorkspaceTabIconCompact tab={item.id} />
            <span>{item.label}</span>
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
            <span className="text-sm font-semibold tracking-tight">{item.label}</span>
            <span
              className={`mt-0.5 block text-[11px] leading-snug ${
                active ? "text-green-700" : "text-slate-500"
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
