import Link from "next/link";
import { Suspense } from "react";
import { AuthPageShell } from "@/components/auth-page-shell";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <AuthPageShell
      title="Welcome back"
      subtitle="Sign in to manage requirements, environments, and AI-generated Playwright tests across your organization."
      footer={
        <>
          <Link href="/" className="text-slate-500 transition hover:text-slate-900">
            Back to home
          </Link>
        </>
      }
    >
      <Suspense fallback={<p className="text-sm text-slate-500">Loading…</p>}>
        <LoginForm />
      </Suspense>
    </AuthPageShell>
  );
}
