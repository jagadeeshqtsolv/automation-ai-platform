"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authFieldClassName, authLabelClassName } from "@/components/auth-page-shell";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Sign in failed");
        return;
      }
      const next = searchParams.get("next");
      router.push(next !== null && next.startsWith("/") ? next : "/dashboard");
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="space-y-4">
        <label className={authLabelClassName}>
          Email
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authFieldClassName}
            placeholder="you@company.com"
            required
          />
        </label>
        <label className={authLabelClassName}>
          Password
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={authFieldClassName}
            placeholder="••••••••"
            required
          />
        </label>
      </div>

      {error !== null ? (
        <div
          className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-100"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      <button
        type="submit"
        disabled={busy}
        className="ui-btn-primary w-full"
      >
        {busy ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-midnight-950/20 border-t-midnight-950" aria-hidden />
            Signing in…
          </>
        ) : (
          <>
            Sign in
            <span aria-hidden>→</span>
          </>
        )}
      </button>

      <p className="text-center text-sm text-zinc-500">
        Registration is by invitation only. Contact your administrator for an invite link.
      </p>
    </form>
  );
}
