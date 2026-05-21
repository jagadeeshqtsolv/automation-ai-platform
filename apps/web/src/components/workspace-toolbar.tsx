"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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

  const displayName = user?.name ?? user?.email ?? "Account";

  return (
    <div className="ui-toolbar">
      {loadError !== null ? (
        <span className="text-sm text-rose-300" role="alert">
          {loadError}
        </span>
      ) : orgs.length === 0 ? (
        <span className="text-sm text-zinc-500">No workspace</span>
      ) : orgs.length === 1 ? (
        <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-ink-950/50 px-3.5 py-2">
          <span className="ui-eyebrow">Workspace</span>
          <span className="text-sm font-semibold tracking-tight text-white">{orgs[0]?.name}</span>
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
          >
            {orgs.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="ml-auto flex items-center gap-2">
        <span
          className="hidden max-w-[200px] truncate text-sm text-zinc-400 sm:inline"
          title={user?.email}
        >
          {displayName}
        </span>
        {user?.isPlatformAdmin === true ? (
          <Link href="/admin" className="ui-btn-ghost !px-3 !py-2 text-xs">
            Admin
          </Link>
        ) : null}
        <Link href="/" className="ui-btn-ghost !px-3 !py-2 text-xs">
          Home
        </Link>
        <button type="button" onClick={() => void handleLogout()} className="ui-btn-secondary !px-3 !py-2 text-xs">
          Sign out
        </button>
      </div>
    </div>
  );
}

