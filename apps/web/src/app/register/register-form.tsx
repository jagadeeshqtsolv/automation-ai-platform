"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/toast-provider";
import { authFieldClassName, authLabelClassName } from "@/components/auth-page-shell";
import { readApiError } from "@/lib/api-response";
import { writeSelectedOrganizationId } from "@/lib/selected-organization";

type InvitePreview = {
  email: string;
  role: string;
  expiresAt: string;
  organization: { id: string; name: string; slug: string };
};

export function RegisterForm({ inviteToken }: { inviteToken: string }) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inviteToken.length === 0) {
      setLoadingInvite(false);
      setInviteError("Registration requires a valid invitation link.");
      return;
    }

    setLoadingInvite(true);
    setInviteError(null);
    void fetch(`/api/auth/invite?token=${encodeURIComponent(inviteToken)}`)
      .then(async (res) => {
        if (!res.ok) {
          setInvite(null);
          setInviteError(await readApiError(res, "Invitation is invalid or expired"));
          return;
        }
        const json = (await res.json()) as InvitePreview;
        setInvite(json);
        setEmail(json.email);
      })
      .finally(() => setLoadingInvite(false));
  }, [inviteToken]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (invite === null) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteToken,
          email: email.trim().toLowerCase(),
          password,
          ...(name.trim().length > 0 ? { name: name.trim() } : {}),
        }),
      });
      if (!res.ok) {
        setError(await readApiError(res, "Registration failed"));
        return;
      }
      const resBody = (await res.json()) as { organization?: { id: string } };
      if (resBody.organization?.id !== undefined) {
        writeSelectedOrganizationId(resBody.organization.id);
      }
      toast.success("Account created — welcome!");
      router.push("/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (loadingInvite) {
    return <p className="text-sm text-zinc-400">Validating invitation…</p>;
  }

  if (inviteError !== null || invite === null) {
    return (
      <div className="space-y-4">
        <div className="ui-alert-error" role="alert">
          {inviteError ?? "Invitation required"}
        </div>
        <p className="text-sm text-zinc-400">
          Ask your administrator for an invite link, or sign in if you already have an account.
        </p>
        <Link href="/login" className="ui-btn-secondary inline-flex text-sm" data-testid="register-signin-link">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" data-testid="register-form">
      <div className="rounded-xl border border-accent/25 bg-accent/10 px-4 py-3">
        <p className="text-sm font-medium text-zinc-100">
          Join <span className="text-accent">{invite.organization.name}</span>
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Role: {invite.role} · Invite expires {new Date(invite.expiresAt).toLocaleString()}
        </p>
      </div>

      <label className={authLabelClassName}>
        Your name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={authFieldClassName}
          placeholder="Optional"
          maxLength={120}
          data-testid="register-name-input"
        />
      </label>

      <label className={authLabelClassName}>
        Email
        <input
          type="email"
          autoComplete="email"
          value={email}
          readOnly
          className={`${authFieldClassName} cursor-not-allowed opacity-80`}
          required
          data-testid="register-email-input"
        />
      </label>

      <label className={authLabelClassName}>
        Password
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={authFieldClassName}
          placeholder="At least 8 characters"
          minLength={8}
          required
          data-testid="register-password-input"
        />
      </label>

      {error !== null ? (
        <div
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-100"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <button type="submit" disabled={busy} className="ui-btn-primary w-full" data-testid="register-submit-btn">
        {busy ? (
          <>
            <span
              className="h-4 w-4 animate-spin rounded-full border-2 border-midnight-950/20 border-t-midnight-950"
              aria-hidden
            />
            Creating account…
          </>
        ) : (
          <>
            Create account
            <span aria-hidden>→</span>
          </>
        )}
      </button>

      <p className="text-center text-sm text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-accent transition hover:text-accent-dim" data-testid="register-login-link">
          Sign in
        </Link>
      </p>
    </form>
  );
}
