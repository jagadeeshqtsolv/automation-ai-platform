import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        <BrandLogo size="sm" />
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:text-slate-900 sm:inline-block"
          >
            Sign in
          </Link>
          <Link
            href="/get-started"
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
          >
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
