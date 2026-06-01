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
    color: "bg-violet-500",
    light: "bg-violet-50 text-violet-700",
  },
  {
    step: "02",
    title: "Generate test plan",
    body: "LLM produces structured cases validated with Zod before anything hits your repo.",
    color: "bg-blue-500",
    light: "bg-blue-50 text-blue-700",
  },
  {
    step: "03",
    title: "Build page objects",
    body: "Record from the browser DOM or a mobile device tree, or generate POM classes with locators and methods.",
    color: "bg-amber-500",
    light: "bg-amber-50 text-amber-700",
  },
  {
    step: "04",
    title: "Run tests",
    body: "Playwright specs for web or Mobilewright for iOS/Android — local runners or cloud hubs.",
    color: "bg-green-500",
    light: "bg-green-50 text-green-700",
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
    accent: "bg-blue-50 text-blue-600 ring-blue-100",
  },
  {
    title: "Browser & device recorder",
    body: "Web: capture DOM, iframes, and shadow roots. Mobile: parse accessibility trees from simulators and save page objects per screen.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 006 3.75v16.5a2.25 2.25 0 002.25 2.25h7.5A2.25 2.25 0 0018 20.25V3.75a2.25 2.25 0 00-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3" />
      </svg>
    ),
    accent: "bg-violet-50 text-violet-600 ring-violet-100",
  },
  {
    title: "Frameworks on disk",
    body: "Each project syncs under frameworks/web or frameworks/mobile — page objects, generated tests, configs, and zip export for CI.",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
      </svg>
    ),
    accent: "bg-green-50 text-green-600 ring-green-100",
  },
] as const;

const STATS = [
  { label: "Projects", value: "Multi-tenant" },
  { label: "Runners", value: "Playwright + Mobilewright" },
  { label: "Targets", value: "Web · iOS · Android" },
];

export default function HomePage() {
  return (
    <>
      <SiteHeader />
      <main>
        <HeroSection />
        <TrustBar />
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
    <section className="relative overflow-hidden border-b border-slate-200 bg-white">
      <HeroBackground />
      <div className="relative mx-auto max-w-6xl px-6 pb-20 pt-16 md:pb-28 md:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_480px] lg:gap-20">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {BRAND_TAGLINE}
            </div>
            <h1 className="mt-5 text-balance text-4xl font-semibold leading-[1.12] tracking-tight text-slate-900 sm:text-5xl">
              From product intent to{" "}
              <span className="text-green-600">runnable tests</span>
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-500">
              {BRAND_NAME} turns requirements into validated test plans, page objects, and runnable
              TypeScript specs — for <strong className="font-semibold text-slate-700">web</strong> with
              Playwright and <strong className="font-semibold text-slate-700">mobile</strong> with
              Mobilewright, without hand-writing every test.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/get-started"
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
              >
                Get started free
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 hover:border-slate-300"
              >
                Sign in
              </Link>
            </div>
            <dl className="mt-10 grid grid-cols-3 divide-x divide-slate-200 border-t border-slate-200 pt-8">
              {STATS.map((item) => (
                <div key={item.label} className="px-4 first:pl-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{item.label}</dt>
                  <dd className="mt-1 text-xs font-semibold text-slate-700">{item.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative">
            <div className="absolute -inset-6 rounded-3xl bg-gradient-to-br from-green-100/60 via-transparent to-blue-100/40 blur-2xl" aria-hidden />
            <HeroCodePreviewPanel />
          </div>
        </div>
      </div>
    </section>
  );
}

function HeroBackground() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <svg className="absolute inset-0 h-full w-full opacity-[0.4]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="1" cy="1" r="1" fill="#CBD5E1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#dot-grid)" />
      </svg>
      <div className="absolute right-0 top-0 h-[400px] w-[600px] bg-gradient-to-bl from-green-50 via-transparent to-transparent" />
    </div>
  );
}

function TrustBar() {
  const items = ["Requirements → specs in minutes", "Playwright & Mobilewright", "Git-integrated", "Cloud + local runners", "BrowserStack support"];
  return (
    <div className="border-b border-slate-200 bg-slate-50">
      <div className="mx-auto flex max-w-6xl items-center gap-0 overflow-x-auto px-6 py-3">
        {items.map((item, i) => (
          <div key={item} className="flex shrink-0 items-center">
            {i > 0 && <span className="mx-4 h-3 w-px bg-slate-300" />}
            <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <svg className="h-3 w-3 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              {item}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkflowSection() {
  return (
    <section className="border-b border-slate-200 bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-green-600">How it works</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            One pipeline from intent to tests
          </h2>
          <p className="mt-3 text-slate-500">
            Whether you automate browsers or mobile apps, the same four steps take you from idea to executable spec.
          </p>
        </div>
        <div className="relative mt-14">
          <div className="absolute left-[calc(1.25rem)] top-10 hidden h-0.5 w-[calc(100%-2.5rem)] bg-gradient-to-r from-violet-200 via-amber-200 to-green-200 lg:block" aria-hidden />
          <ol className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s) => (
              <li key={s.step} className="relative flex flex-col rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md hover:border-slate-300">
                <div className={`mb-4 inline-flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold text-white ${s.color}`}>
                  {s.step}
                </div>
                <h3 className="text-sm font-semibold text-slate-900">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

function FeaturesSection() {
  return (
    <section className="bg-slate-50 py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-green-600">Features</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl">
            Built for web and mobile QA
          </h2>
          <p className="mt-3 text-slate-500">
            One workspace for both stacks — requirements, recorders, codegen, execution, and reports.
          </p>
        </div>
        <ul className="mt-12 grid gap-5 md:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition hover:shadow-md hover:border-slate-300">
              <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl ring-1 ${f.accent}`}>
                {f.icon}
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.body}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function CtaSection() {
  return (
    <section className="border-t border-slate-200 bg-white py-20 md:py-28">
      <div className="mx-auto max-w-6xl px-6">
        <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 px-8 py-14 text-center shadow-xl md:px-16">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(141,255,181,0.15),transparent_60%)]" aria-hidden />
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_left,rgba(96,165,250,0.08),transparent_60%)]" aria-hidden />
          <div className="relative">
            <p className="text-xs font-semibold uppercase tracking-widest text-green-400">Get started today</p>
            <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Ready to automate?
            </h2>
            <p className="mx-auto mt-3 max-w-md text-slate-400">
              Sign in, create a web or mobile project, add a requirement, and generate your first
              Playwright or Mobilewright bundle in minutes.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/get-started"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/10 px-6 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/15"
              >
                Read the guide
              </Link>
              <Link
                href="/login"
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-accent-dim"
              >
                Sign in
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
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
    <footer className="border-t border-slate-200 bg-white py-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 sm:flex-row">
        <p className="flex items-center gap-2 text-sm text-slate-500">
          <QuarksLogoMark size="xs" variant="mark" className="!h-6 !w-6 !rounded-lg !p-0.5" />
          <span className="font-medium text-slate-700">{BRAND_NAME}</span>
          <span className="text-slate-300">·</span>
          {BRAND_TAGLINE}
        </p>
        <div className="flex gap-6 text-sm text-slate-500">
          <Link href="/get-started" className="transition hover:text-slate-900">Get started</Link>
          <Link href="/login" className="transition hover:text-slate-900">Sign in</Link>
          <Link href="/register" className="transition hover:text-slate-900">Register</Link>
        </div>
      </div>
    </footer>
  );
}
