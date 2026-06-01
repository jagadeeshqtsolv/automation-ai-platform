"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { QuarksLogoMark } from "@/components/quarks-logo-mark";
import { BRAND_NAME } from "@/lib/brand";
import {
  readSelectedOrganizationId,
  writeSelectedOrganizationId,
} from "@/lib/selected-organization";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  role: string;
};

type MeUser = {
  id: string;
  email: string;
  name: string | null;
  isPlatformAdmin?: boolean;
};

export function WorkspaceToolbar({
  organizationId,
  onOrganizationChange,
  onReady,
}: {
  organizationId: string | null;
  onOrganizationChange: (organizationId: string) => void;
  onReady?: () => void;
}) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [user, setUser] = useState<MeUser | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const onOrganizationChangeRef = useRef(onOrganizationChange);
  const onReadyRef = useRef(onReady);
  const organizationIdRef = useRef(organizationId);
  const initialOrgSyncedRef = useRef(false);

  useEffect(() => {
    onOrganizationChangeRef.current = onOrganizationChange;
  }, [onOrganizationChange]);

  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    organizationIdRef.current = organizationId;
  }, [organizationId]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setLoadError(null);
      try {
        const res = await fetch("/api/auth/me");
        if (!res.ok) {
          if (!cancelled) {
            const body = (await res.json().catch(() => null)) as { error?: string } | null;
            setLoadError(body?.error ?? "Could not load session");
            setOrgs([]);
            setUser(null);
          }
          return;
        }

        const json = (await res.json()) as {
          user: MeUser;
          organizations: OrgRow[];
        };

        if (cancelled) {
          return;
        }

        setUser(json.user);
        setOrgs(json.organizations);

        if (json.organizations.length > 0 && !initialOrgSyncedRef.current) {
          initialOrgSyncedRef.current = true;
          const stored = readSelectedOrganizationId();
          const match =
            stored !== null ? json.organizations.find((o) => o.id === stored) : undefined;
          const nextId = match?.id ?? json.organizations[0]?.id;
          if (nextId !== undefined) {
            writeSelectedOrganizationId(nextId);
            if (nextId !== organizationIdRef.current) {
              onOrganizationChangeRef.current(nextId);
            }
          }
        }
      } catch {
        if (!cancelled) {
          setLoadError("Could not load session");
          setOrgs([]);
        }
      } finally {
        if (!cancelled) {
          onReadyRef.current?.();
        }
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  function handleOrgSelect(nextId: string) {
    writeSelectedOrganizationId(nextId);
    onOrganizationChange(nextId);
  }

  return (
    <div className="ui-toolbar">
      {/* Brand */}
      <div className="flex items-center gap-2 pr-4 border-r-2 border-slate-300">
        <QuarksLogoMark size="sm" />
        <span className="text-sm font-semibold text-slate-800">{BRAND_NAME}</span>
      </div>

      {loadError !== null ? (
        <span className="text-sm text-rose-600" role="alert">
          {loadError}
        </span>
      ) : orgs.length === 0 ? (
        <span className="text-sm text-slate-500">No workspace</span>
      ) : orgs.length === 1 ? (
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-slate-400">Organization :</span>
          <span className="text-sm font-semibold text-slate-900">{orgs[0]?.name}</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <label htmlFor="org-select" className="ui-eyebrow sr-only">
            Workspace
          </label>
          <select
            id="org-select"
            value={organizationId ?? orgs[0]?.id ?? ""}
            onChange={(e) => handleOrgSelect(e.target.value)}
            className="ui-select max-w-[240px]"
            data-testid="nav-org-select"
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="ml-auto flex items-center gap-1.5">
        {/* Home */}
        <Link
          href="/"
          data-testid="nav-home-link"
          title="Home"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
          </svg>
          <span className="hidden sm:inline">Home</span>
        </Link>

        {/* Admin */}
        {user?.isPlatformAdmin === true && (
          <Link
            href="/admin"
            data-testid="nav-admin-link"
            title="Admin"
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="hidden sm:inline">Admin</span>
          </Link>
        )}

        {/* Divider */}
        <span className="mx-1 h-4 w-px bg-slate-200" />

        {/* User avatar + name */}
        {user !== null && (
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5">
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-violet-100 text-[10px] font-bold text-violet-700">
              {(user.name ?? user.email).charAt(0).toUpperCase()}
            </div>
            <span className="hidden max-w-[160px] truncate text-xs font-medium text-slate-700 sm:block" title={user.email}>
              {user.name ?? user.email}
            </span>
          </div>
        )}

        {/* Sign out */}
        <button
          type="button"
          onClick={() => void handleLogout()}
          data-testid="nav-signout-btn"
          title="Sign out"
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-rose-50 hover:text-rose-600"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
          </svg>
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </div>
    </div>
  );
}

