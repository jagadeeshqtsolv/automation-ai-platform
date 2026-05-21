import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-accent/10 bg-midnight-950/85 backdrop-blur-xl supports-[backdrop-filter]:bg-midnight-950/70">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        <BrandLogo size="sm" />
        <nav className="flex items-center gap-2 sm:gap-3">
          <Link
            href="/login"
            className="hidden rounded-lg px-3 py-1.5 text-sm text-zinc-400 transition hover:text-accent sm:inline-block"
          >
            Sign in
          </Link>
          <Link href="/get-started" className="ui-btn-primary !px-3.5 !py-1.5 text-sm">
            Get started
          </Link>
        </nav>
      </div>
    </header>
  );
}
