import Link from "next/link";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { QuarksLogoMark } from "@/components/quarks-logo-mark";
import { HeroCodePreviewPanel } from "@/components/hero-code-preview-panel";
import { SiteHeader } from "@/components/site-header";

const STEPS = [
  {
    step: "01",
    title: "Capture requirements",
    body: "Write product intent per project — flows, edge cases, and acceptance criteria.",
  },
  {
    step: "02",
    title: "Generate test plan",
    body: "LLM produces structured cases validated with Zod before anything hits your repo.",
  },
  {
    step: "03",
    title: "Build page objects",
    body: "Record from the browser DOM or a mobile device tree, or generate POM classes with locators and methods.",
  },
  {
    step: "04",
    title: "Run tests",
    body: "Playwright specs for web or Mobilewright specs for iOS/Android — local runners or cloud hubs from one workspace.",
  },
] as const;

const FEATURES = [
  {
    title: "Web & mobile projects",
    body: "Create a Playwright web project or a Mobilewright mobile project at setup time. Same workspace flow, runner matched to the platform.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 01-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0115 18.257V17.25m6-12V15a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 15V5.25m18 0A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25m18 0V12a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 12V5.25" />
      </svg>
    ),
  },
  {
    title: "Browser & device recorder",
    body: "Web: capture DOM, iframes, and shadow roots. Mobile: parse accessibility trees from simulators and save page objects per screen.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
  },
  {
    title: "Frameworks on disk",
    body: "Each project syncs under frameworks/web or frameworks/mobile — page objects, generated tests, configs, and zip export for CI.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
  },
] as const;

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <WorkflowSection />
        <FeaturesSection />
        <CtaSection />
        <SiteFooter />
      </main>
    </>
  );
}

function HeroSection() {
  return (
    <section className="relative overflow-hidden border-b border-white/[0.06]">
      <HeroBackground />
      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 md:pb-28 md:pt-20">
        <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
          <div className="max-w-xl">
            <p className="ui-chip text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              {BRAND_TAGLINE}
            </p>
            <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.1] tracking-tight text-white sm:text-5xl lg:text-[3.25rem]">
              From product intent to{" "}
              <span className="bg-gradient-to-r from-accent via-accent-muted to-accent-dim bg-clip-text text-transparent">
                runnable tests
              </span>
            </h1>
            <p className="mt-5 text-pretty text-lg leading-relaxed text-zinc-400">
              {BRAND_NAME} turns requirements into validated test plans, page objects, and runnable TypeScript specs —
              for <strong className="font-medium text-zinc-300">web</strong> with Playwright and{" "}
              <strong className="font-medium text-zinc-300">mobile</strong> with Mobilewright, without hand-writing every
              test.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="rounded-full border border-accent/25 bg-accent/10 px-3 py-1 text-xs font-medium text-accent">
                Playwright · Web
              </span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-zinc-300">
                Mobilewright · iOS & Android
              </span>
            </div>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/get-started" className="ui-btn-primary px-5 py-2.5">
                Get started
                <span aria-hidden>→</span>
              </Link>
              <Link href="/login" className="ui-btn-secondary px-5 py-2.5">
                Sign in
              </Link>
            </div>
            <dl className="mt-10 grid grid-cols-3 gap-4 border-t border-white/10 pt-8">
              {[
                { label: "Projects", value: "Multi-tenant" },
                { label: "Runners", value: "Playwright & Mobilewright" },
                { label: "Targets", value: "Web · iOS · Android" },
              ].map((item) => (
                <div key={item.label}>
                  <dt className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">{item.label}</dt>
                  <dd className="mt-1 text-sm font-semibold text-zinc-200">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <HeroPreviewCard />
        </div>
      </div>
    </section>
  );
}

function HeroPreviewCard() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none">
      <div className="absolute -inset-4 rounded-3xl bg-gradient-to-br from-accent/25 via-transparent to-accent/5 blur-2xl" aria-hidden />
      <HeroCodePreviewPanel />
    </div>
  );
}

function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div
        className="absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />
      <div className="absolute left-1/2 top-0 h-[480px] w-[720px] -translate-x-1/2 rounded-full bg-accent/10 blur-[100px]" />
    </div>
  );
}

function WorkflowSection() {
  return (
    <section className="border-b border-accent/10 bg-midnight-950/50 py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">How {BRAND_NAME} works</h2>
          <p className="mt-3 text-zinc-400">
            One pipeline from product intent to specs on disk — whether you automate browsers or mobile apps.
          </p>
        </div>
        <ol className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li
              key={s.step}
              className="group relative rounded-2xl border border-white/[0.06] bg-midnight-900/60 p-5 transition hover:border-accent/25 hover:bg-midnight-800/80"
            >
              <span className="font-mono text-xs font-semibold text-accent">{s.step}</span>
              <h3 className="mt-3 text-base font-semibold text-white">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="py-20 md:py-24">
      <div className="mx-auto max-w-6xl px-6">
        <h2 className="text-center text-2xl font-semibold tracking-tight text-white md:text-3xl">
          Built for web and mobile QA
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-center text-zinc-400">
          One workspace for both stacks — requirements, recorders, codegen, execution, and reports without scattered
          locator files.
        </p>
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {FEATURES.map((f) => (
            <li
              key={f.title}
              className="rounded-2xl border border-white/[0.06] bg-gradient-to-b from-midnight-900/80 to-midnight-950/90 p-6 shadow-inner shadow-black/30"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/20">
                {f.icon}
              </div>
              <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-400">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="border-t border-white/[0.06] py-16 md:py-20">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-3xl border border-accent/25 bg-gradient-to-br from-accent/12 via-midnight-900/95 to-midnight-950 px-8 py-12 text-center md:px-16 md:py-14">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(141,255,181,0.18),transparent_60%)]" aria-hidden />
          <div className="relative">
            <h2 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Ready to automate?</h2>
            <p className="mx-auto mt-3 max-w-md text-zinc-300">
              Sign in, create a web or mobile project, add a requirement, and generate your first Playwright or
              Mobilewright bundle in minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/get-started" className="ui-btn-secondary px-6 py-2.5">
                Read the guide
              </Link>
              <Link href="/login" className="ui-btn-primary px-6 py-2.5">
                Sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-white/[0.06] py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <p className="flex items-center gap-2 text-sm text-zinc-500">
          <QuarksLogoMark size="xs" variant="mark" className="!h-6 !w-6 !rounded-lg !p-0.5" />
          {BRAND_NAME} — {BRAND_TAGLINE}
        </p>
        <div className="flex gap-6 text-sm text-zinc-500">
          <Link href="/get-started" className="transition hover:text-white">
            Get started
          </Link>
          <Link href="/login" className="transition hover:text-white">
            Sign in
          </Link>
          <Link href="/register" className="transition hover:text-white">
            Register
          </Link>
        </div>
      </div>
    </footer>
  );
}
