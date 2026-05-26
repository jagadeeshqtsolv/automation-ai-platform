import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { BRAND_TAGLINE } from "@/lib/brand";
import { BrandLogo } from "@/components/brand-logo";

const AUTH_FEATURES = [
  "Requirements → test plans → Playwright test code",
  "Browser recorder and page-object library",
  "Per-organization projects and access control",
] as const;

export const authFieldClassName = "ui-input mt-1.5";

export const authLabelClassName = "ui-label text-zinc-300";

export function AuthPageShell({
  title,
  subtitle,
  children,
  footer,
  wide = false,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer: ReactNode;
  wide?: boolean;
}) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      <AuthBackground />

      <div className="relative mx-auto flex min-h-dvh max-w-6xl flex-col px-6 py-8 lg:flex-row lg:items-stretch lg:gap-12 lg:py-12">
        <aside className="flex flex-col justify-between pb-10 lg:w-[42%] lg:pb-0 lg:pt-4">
          <div>
            <BrandLogo size="lg" showTagline />

            <p className="mt-8 ui-chip">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
              {BRAND_TAGLINE}
            </p>

            <h1 className="mt-6 text-balance text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
              {title}
            </h1>
            <p className="mt-3 max-w-md text-pretty text-base leading-relaxed text-zinc-400">{subtitle}</p>

            <ul className="mt-8 hidden space-y-3 sm:block">
              {AUTH_FEATURES.map((item) => (
                <li key={item} className="flex items-start gap-3 text-sm text-zinc-400">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-accent/15 text-accent"
                    aria-hidden
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <p className="mt-10 hidden text-sm text-zinc-500 lg:block">{footer}</p>
        </aside>

        <main className={`flex flex-1 flex-col justify-center lg:py-4 ${wide ? "lg:max-w-xl" : "lg:max-w-[480px]"}`}>
          <div className="ui-panel w-full p-6 sm:p-8">
            <div className="mb-6 border-b border-accent/10 pb-6 lg:hidden">
              <h2 className="text-xl font-semibold text-white">{title}</h2>
              <p className="mt-1 text-sm text-zinc-400">{subtitle}</p>
            </div>
            <div className="hidden lg:block">
              <h2 className="text-lg font-semibold text-white">Account</h2>
              <p className="mt-1 text-sm text-zinc-500">Use your work email and password.</p>
            </div>
            <div className="mt-6 lg:mt-5">{children}</div>
          </div>
          <p className="mt-6 text-center text-sm text-zinc-500 lg:hidden">{footer}</p>
        </main>
      </div>
    </div>
  );
}

function AuthBackground() {
  const gridStyle: CSSProperties = {
    backgroundImage:
      "linear-gradient(rgba(141,255,181,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(141,255,181,0.04) 1px, transparent 1px)",
    backgroundSize: "48px 48px",
  };

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="absolute inset-0 opacity-[0.5]" style={gridStyle} />
      <div className="absolute left-0 top-0 h-[420px] w-[560px] -translate-x-1/4 rounded-full bg-accent/10 blur-[100px]" />
      <div className="absolute bottom-0 right-0 h-[360px] w-[480px] translate-x-1/4 rounded-full bg-accent/[0.06] blur-[90px]" />
    </div>
  );
}
