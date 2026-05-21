"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/toast-provider";
import { WorkspaceToolbar } from "@/components/workspace-toolbar";
import { readApiError } from "@/lib/api-response";
import { readSelectedOrganizationId, writeSelectedOrganizationId } from "@/lib/selected-organization";

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  disabled: boolean;
  createdAt: string;
  memberCount: number;
  projectCount: number;
  pendingInviteCount: number;
};

type MemberRow = {
  id: string;
  role: string;
  createdAt: string;
  user: { id: string; email: string; name: string | null };
};

type InviteRow = {
  id: string;
  email: string;
  role: string;
  expiresAt: string;
  usedAt: string | null;
  createdAt: string;
};

export function AdminWorkspace() {
  const router = useRouter();
  const toast = useToast();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [newOrgName, setNewOrgName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"member" | "owner">("member");
  const [assignEmail, setAssignEmail] = useState("");
  const [assignRole, setAssignRole] = useState<"member" | "owner">("member");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const loadOrgs = useCallback(async () => {
    const res = await fetch("/api/admin/organizations");
    if (!res.ok) {
      toast.error(await readApiError(res, "Could not load organizations"));
      return;
    }
    const rows = (await res.json()) as OrgRow[];
    setOrgs(rows);
    setSelectedOrgId((prev) => {
      if (prev.length > 0 && rows.some((r) => r.id === prev)) {
        return prev;
      }
      return rows[0]?.id ?? "";
    });
  }, [toast]);

  const loadOrgDetails = useCallback(
    async (orgId: string) => {
      if (orgId.length === 0) {
        setMembers([]);
        setInvites([]);
        return;
      }
      const [membersRes, invitesRes] = await Promise.all([
        fetch(`/api/admin/organizations/${orgId}/members`),
        fetch(`/api/admin/organizations/${orgId}/invites`),
      ]);
      if (membersRes.ok) {
        setMembers((await membersRes.json()) as MemberRow[]);
      }
      if (invitesRes.ok) {
        setInvites((await invitesRes.json()) as InviteRow[]);
      }
    },
    [],
  );

  useEffect(() => {
    void fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        const isAdmin =
          json !== null &&
          typeof json === "object" &&
          "user" in json &&
          (json as { user: { isPlatformAdmin?: boolean } }).user.isPlatformAdmin === true;
        setAllowed(isAdmin);
        if (!isAdmin) {
          router.replace("/dashboard");
        }
      });
  }, [router]);

  useEffect(() => {
    if (allowed !== true) {
      return;
    }
    void loadOrgs();
  }, [allowed, loadOrgs]);

  useEffect(() => {
    if (allowed !== true || selectedOrgId.length === 0) {
      return;
    }
    void loadOrgDetails(selectedOrgId);
  }, [allowed, selectedOrgId, loadOrgDetails]);

  async function createOrg(e: FormEvent) {
    e.preventDefault();
    setBusy("org");
    try {
      const res = await fetch("/api/admin/organizations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newOrgName.trim() }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not create organization"));
        return;
      }
      const org = (await res.json()) as { id: string; name: string };
      setNewOrgName("");
      setSelectedOrgId(org.id);
      await loadOrgs();
      toast.success(`Organization "${org.name}" created`);
    } finally {
      setBusy(null);
    }
  }

  async function sendInvite(e: FormEvent) {
    e.preventDefault();
    if (selectedOrgId.length === 0) {
      return;
    }
    setBusy("invite");
    try {
      const res = await fetch(`/api/admin/organizations/${selectedOrgId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not create invite"));
        return;
      }
      const body = (await res.json()) as { inviteUrl: string };
      setLastInviteUrl(body.inviteUrl);
      setInviteEmail("");
      await loadOrgDetails(selectedOrgId);
      toast.success("Invite link created — copy and send it to the user");
    } finally {
      setBusy(null);
    }
  }

  async function assignMember(e: FormEvent) {
    e.preventDefault();
    if (selectedOrgId.length === 0) {
      return;
    }
    setBusy("assign");
    try {
      const res = await fetch(`/api/admin/organizations/${selectedOrgId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: assignEmail.trim(), role: assignRole }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not assign user"));
        return;
      }
      setAssignEmail("");
      await loadOrgDetails(selectedOrgId);
      toast.success("User assigned to organization");
    } finally {
      setBusy(null);
    }
  }

  async function toggleOrganizationEnabled(org: OrgRow) {
    const nextDisabled = org.disabled !== true;
    const action = nextDisabled ? "disable" : "enable";
    const confirmed = window.confirm(
      nextDisabled
        ? `Disable organization "${org.name}"?\n\nMembers will lose access to its projects until you enable it again. Data is kept on disk and in the database.`
        : `Enable organization "${org.name}"?\n\nMembers will be able to access its projects again.`,
    );
    if (!confirmed) {
      return;
    }
    setBusy("toggle-org");
    try {
      const res = await fetch(`/api/admin/organizations/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disabled: nextDisabled }),
      });
      if (!res.ok) {
        toast.error(await readApiError(res, `Could not ${action} organization`));
        return;
      }
      if (nextDisabled && readSelectedOrganizationId() === org.id) {
        writeSelectedOrganizationId("");
      }
      await loadOrgs();
      toast.success(
        nextDisabled ? `Organization "${org.name}" disabled` : `Organization "${org.name}" enabled`,
      );
    } finally {
      setBusy(null);
    }
  }

  async function removeMember(userId: string, email: string) {
    if (selectedOrgId.length === 0) {
      return;
    }
    const confirmed = window.confirm(`Remove ${email} from this organization?`);
    if (!confirmed) {
      return;
    }
    setBusy("remove");
    try {
      const res = await fetch(`/api/admin/organizations/${selectedOrgId}/members/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(await readApiError(res, "Could not remove member"));
        return;
      }
      await loadOrgDetails(selectedOrgId);
      toast.success("Member removed");
    } finally {
      setBusy(null);
    }
  }

  async function copyInviteUrl() {
    if (lastInviteUrl === null) {
      return;
    }
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  }

  if (allowed === null) {
    return <p className="text-sm text-zinc-400">Checking access…</p>;
  }

  if (allowed !== true) {
    return null;
  }

  const selectedOrg = orgs.find((o) => o.id === selectedOrgId);

  return (
    <div className="space-y-8">
      <WorkspaceToolbar
        organizationId={null}
        onOrganizationChange={() => undefined}
        onReady={() => undefined}
      />

      <header className="border-b border-white/[0.08] pb-6">
        <p className="ui-eyebrow text-accent">Platform admin</p>
        <h1 className="ui-title-lg">Organizations & users</h1>
        <p className="ui-subtitle mt-2 max-w-2xl">
          Create organizations, invite new users, and assign existing accounts. Users cannot self-register without an
          invite link.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/dashboard" className="ui-btn-secondary ui-btn-sm">
            Dashboard
          </Link>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
        <aside className="ui-panel p-4">
          <h2 className="text-sm font-semibold text-white">Create organization</h2>
          <form onSubmit={createOrg} className="mt-3 space-y-2">
            <input
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              className="ui-input !mt-0"
              placeholder="Acme QA"
              required
              maxLength={120}
            />
            <button type="submit" disabled={busy !== null} className="ui-btn-primary ui-btn-sm w-full">
              {busy === "org" ? "Creating…" : "Create"}
            </button>
          </form>

          <h2 className="mt-6 text-sm font-semibold text-white">Organizations</h2>
          <ul className="mt-2 max-h-64 space-y-1 overflow-auto">
            {orgs.length === 0 ? (
              <li className="text-xs text-zinc-500">None yet</li>
            ) : (
              orgs.map((o) => (
                <li key={o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedOrgId(o.id);
                      writeSelectedOrganizationId(o.id);
                    }}
                    className={`w-full rounded-lg px-2 py-2 text-left text-xs transition ${
                      o.id === selectedOrgId
                        ? "bg-accent/15 text-accent ring-1 ring-accent/30"
                        : o.disabled === true
                          ? "bg-rose-950/20 text-zinc-400 hover:bg-white/5"
                          : "text-zinc-300 hover:bg-white/5"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="block font-medium text-white">{o.name}</span>
                      {o.disabled === true ? (
                        <span className="rounded bg-rose-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                          Disabled
                        </span>
                      ) : null}
                    </span>
                    <span className="text-zinc-500">
                      {o.memberCount} members · {o.projectCount} projects
                    </span>
                  </button>
                </li>
              ))
            )}
          </ul>
        </aside>

        <div className="space-y-6">
          {selectedOrg === undefined ? (
            <p className="text-sm text-zinc-400">Select or create an organization.</p>
          ) : (
            <>
              <section className="ui-panel p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="flex flex-wrap items-center gap-2 text-lg font-semibold text-white">
                      {selectedOrg.name}
                      {selectedOrg.disabled === true ? (
                        <span className="rounded-md bg-rose-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-200">
                          Disabled
                        </span>
                      ) : (
                        <span className="rounded-md bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-200">
                          Enabled
                        </span>
                      )}
                    </h2>
                    <p className="text-xs text-zinc-500">{selectedOrg.slug}</p>
                  </div>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void toggleOrganizationEnabled(selectedOrg)}
                    className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-50 ${
                      selectedOrg.disabled === true
                        ? "border-emerald-500/30 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-500/10"
                        : "border-amber-500/30 bg-amber-950/40 text-amber-200 hover:bg-amber-500/10"
                    }`}
                  >
                    {busy === "toggle-org"
                      ? "Saving…"
                      : selectedOrg.disabled === true
                        ? "Enable organization"
                        : "Disable organization"}
                  </button>
                </div>

                <form onSubmit={sendInvite} className="mt-4 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="ui-label">
                    Invite by email
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="ui-input"
                      placeholder="user@company.com"
                      required
                    />
                  </label>
                  <label className="ui-label">
                    Role
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value as "member" | "owner")}
                      className="ui-select w-full"
                    >
                      <option value="member">Member</option>
                      <option value="owner">Owner</option>
                    </select>
                  </label>
                  <button type="submit" disabled={busy !== null} className="ui-btn-primary ui-btn-sm">
                    {busy === "invite" ? "…" : "Create invite"}
                  </button>
                </form>

                {lastInviteUrl !== null ? (
                  <div className="mt-3 flex flex-col gap-2 rounded-lg border border-accent/20 bg-accent/5 p-3 sm:flex-row sm:items-center">
                    <code className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">{lastInviteUrl}</code>
                    <button type="button" onClick={() => void copyInviteUrl()} className="ui-btn-secondary ui-btn-xs shrink-0">
                      Copy link
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="ui-panel p-5">
                <h3 className="text-sm font-semibold text-white">Assign existing user</h3>
                <p className="mt-1 text-xs text-zinc-500">For accounts that already signed up via another invite.</p>
                <form onSubmit={assignMember} className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="ui-label">
                    Email
                    <input
                      type="email"
                      value={assignEmail}
                      onChange={(e) => setAssignEmail(e.target.value)}
                      className="ui-input"
                      required
                    />
                  </label>
                  <label className="ui-label">
                    Role
                    <select
                      value={assignRole}
                      onChange={(e) => setAssignRole(e.target.value as "member" | "owner")}
                      className="ui-select w-full"
                    >
                      <option value="member">Member</option>
                      <option value="owner">Owner</option>
                    </select>
                  </label>
                  <button type="submit" disabled={busy !== null} className="ui-btn-secondary ui-btn-sm">
                    {busy === "assign" ? "…" : "Assign"}
                  </button>
                </form>
              </section>

              <section className="ui-panel p-5">
                <h3 className="text-sm font-semibold text-white">Members</h3>
                <ul className="mt-3 space-y-2">
                  {members.length === 0 ? (
                    <li className="text-xs text-zinc-500">No members</li>
                  ) : (
                    members.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-white/5 px-3 py-2 text-sm"
                      >
                        <div>
                          <p className="font-medium text-white">{m.user.email}</p>
                          <p className="text-xs text-zinc-500">
                            {m.role}
                            {m.user.name !== null ? ` · ${m.user.name}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void removeMember(m.user.id, m.user.email)}
                          className="text-xs text-rose-300 hover:underline disabled:opacity-40"
                        >
                          Remove
                        </button>
                      </li>
                    ))
                  )}
                </ul>
              </section>

              <section className="ui-panel p-5">
                <h3 className="text-sm font-semibold text-white">Recent invites</h3>
                <ul className="mt-3 space-y-2 text-xs text-zinc-400">
                  {invites.length === 0 ? (
                    <li>None</li>
                  ) : (
                    invites.map((i) => (
                      <li key={i.id} className="rounded-lg border border-white/5 px-3 py-2">
                        <span className="font-medium text-zinc-200">{i.email}</span> · {i.role}
                        {i.usedAt !== null ? (
                          <span className="text-accent"> · used</span>
                        ) : new Date(i.expiresAt) < new Date() ? (
                          <span className="text-rose-400"> · expired</span>
                        ) : (
                          <span> · pending</span>
                        )}
                      </li>
                    ))
                  )}
                </ul>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
