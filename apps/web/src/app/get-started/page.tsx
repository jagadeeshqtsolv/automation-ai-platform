import type { ReactNode } from "react";
import Link from "next/link";
import { BRAND_NAME, BRAND_TAGLINE } from "@/lib/brand";
import { SiteHeader } from "@/components/site-header";

const SECTIONS = [
  { id: "overview", label: "Overview" },
  { id: "platforms", label: "Web vs mobile" },
  { id: "before-you-begin", label: "Before you begin" },
  { id: "quick-start", label: "Quick start" },
  { id: "workspace", label: "Project workspace" },
  { id: "requirements", label: "Requirements & plans" },
  { id: "page-objects", label: "Page objects & recorder" },
  { id: "tests", label: "Generate & run tests" },
  { id: "framework", label: "Framework on disk" },
  { id: "tips", label: "Tips & troubleshooting" },
] as const;

export default function GetStartedPage() {
  return (
    <>
      <SiteHeader />
      <main className="border-b border-white/[0.06]">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16">
          <div className="max-w-2xl">
            <p className="ui-chip text-xs">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Documentation
            </p>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white md:text-4xl">
              How to use {BRAND_NAME}
            </h1>
            <p className="mt-3 text-lg leading-relaxed text-zinc-400">
              {BRAND_TAGLINE}. This guide covers both <strong className="font-medium text-zinc-300">web</strong> projects
              (Playwright) and <strong className="font-medium text-zinc-300">mobile</strong> projects (Mobilewright) —
              from sign-in through recording, codegen, and test runs.
            </p>
          </div>

          <div className="mt-12 grid gap-10 lg:grid-cols-[220px_1fr] lg:gap-14">
            <DocNav />
            <article className="min-w-0 space-y-14">
              <DocSection id="overview" title="Overview">
                <p>
                  {BRAND_NAME} is a workspace for no-code-style test automation. You describe what to test in plain
                  language, generate structured test plans and TypeScript specs, capture UI with a recorder, and run
                  tests locally or on cloud farms — all inside one project.
                </p>
                <p className="mt-3">
                  When you <strong className="text-zinc-200">create a project</strong>, choose the platform:
                </p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-300">
                  <li>
                    <strong className="text-zinc-200">Web (Playwright)</strong> — browser automation, DOM recorder,
                    page objects with CSS/role locators, iframe and shadow DOM support.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Mobile (Mobilewright)</strong> — iOS/Android simulators and
                    devices, accessibility-tree recorder, screen page objects, device pool and cloud hubs.
                  </li>
                </ul>
                <p className="mt-3">The typical flow (both platforms):</p>
                <ol className="mt-3 list-decimal space-y-2 pl-5 text-zinc-300">
                  <li>Configure your project OpenAI API key and execution settings in Setup.</li>
                  <li>
                    Create environments (base URL and browser for web; bundle ID and device for mobile).
                  </li>
                  <li>Write requirements and generate test plans.</li>
                  <li>Build page objects with the recorder or AI-assisted codegen.</li>
                  <li>Generate specs and run them from Test execution; review reports when finished.</li>
                </ol>
              </DocSection>

              <DocSection id="platforms" title="Web vs mobile">
                <p>
                  Platform is fixed when the project is created. Everything else — requirements, plans, execution,
                  framework zip — follows the same workspace, but the runner, recorder, and on-disk layout differ.
                </p>

                <div className="mt-4 overflow-x-auto rounded-xl border border-white/[0.06]">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-white/[0.06] bg-midnight-900/80 text-zinc-400">
                        <th className="px-4 py-3 font-medium">Topic</th>
                        <th className="px-4 py-3 font-medium">Web (Playwright)</th>
                        <th className="px-4 py-3 font-medium">Mobile (Mobilewright)</th>
                      </tr>
                    </thead>
                    <tbody className="text-zinc-300">
                      <PlatformRow
                        topic="Test runner"
                        web="@playwright/test"
                        mobile="@mobilewright/test"
                      />
                      <PlatformRow
                        topic="Config file"
                        web="playwright.config.ts"
                        mobile="mobilewright.config.ts"
                      />
                      <PlatformRow
                        topic="Framework folder"
                        web="frameworks/web/&lt;project-id&gt;/"
                        mobile="frameworks/mobile/&lt;project-id&gt;/"
                      />
                      <PlatformRow
                        topic="Recorder"
                        web="Browser — capture DOM, iframes, shadow roots"
                        mobile="Device — parse accessibility tree from simulator/emulator"
                      />
                      <PlatformRow
                        topic="Environment"
                        web="baseURL, browser, headless, timeout"
                        mobile="platform, bundleId, deviceName, installApps, …"
                      />
                      <PlatformRow
                        topic="Local runs"
                        web="Chromium/Firefox/WebKit via Playwright"
                        mobile="Booted iOS simulator or Android emulator"
                      />
                      <PlatformRow
                        topic="Cloud runs"
                        web="BrowserStack, LambdaTest, Sauce Labs, custom hub"
                        mobile="Same providers (mobile capabilities)"
                      />
                      <PlatformRow
                        topic="Codegen API"
                        web="/api/generate/playwright"
                        mobile="/api/generate/mobilewright"
                      />
                    </tbody>
                  </table>
                </div>

                <p className="mt-4 text-sm">
                  Legacy mobile projects may still live under{" "}
                  <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs text-zinc-300">
                    frameworks/&lt;project-id&gt;/
                  </code>{" "}
                  without the <code className="font-mono text-xs">mobile/</code> prefix; new projects use the paths
                  above.
                </p>
              </DocSection>

              <DocSection id="before-you-begin" title="Before you begin">
                <h3 className="text-base font-semibold text-white">Account access</h3>
                <p className="mt-2">
                  Registration is invite-only. Your organization admin sends an invite link; use it on the{" "}
                  <Link href="/register" className="text-accent hover:underline">
                    register
                  </Link>{" "}
                  page, then sign in at{" "}
                  <Link href="/login" className="text-accent hover:underline">
                    login
                  </Link>
                  .
                </p>

                <h3 className="mt-6 text-base font-semibold text-white">OpenAI API key</h3>
                <p className="mt-2">
                  Test plans, page objects, and generated specs use each project&apos;s OpenAI key — not a shared
                  platform key. After sign-in, open a project → <strong className="text-zinc-200">Setup</strong> → save
                  your API key before generating anything.
                </p>

                <h3 className="mt-6 text-base font-semibold text-white">Local test runs</h3>
                <p className="mt-2">
                  The app writes an isolated framework folder on the machine where the web app runs (see{" "}
                  <a href="#framework" className="text-accent hover:underline">
                    Framework on disk
                  </a>
                  ). You need Node.js 20+ and npm.
                </p>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-zinc-300">
                  <li>
                    <strong className="text-zinc-200">Web</strong> — Playwright browsers install on first run (
                    <code className="font-mono text-xs text-zinc-400">npx playwright install</code> if you run CLI
                    manually). Set a reachable <code className="font-mono text-xs text-zinc-400">baseURL</code> in your
                    environment.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Mobile</strong> — Boot the iOS simulator or Android emulator that
                    matches your environment (bundle ID, platform). Mobilewright manages the device pool for local runs.
                  </li>
                </ul>
              </DocSection>

              <DocSection id="quick-start" title="Quick start">
                <ol className="space-y-6">
                  <QuickStep n={1} title="Sign in & create a project">
                    Open the dashboard after login. Click <strong className="text-zinc-200">New project</strong>, enter a
                    name, and pick <strong className="text-zinc-200">Web (Playwright)</strong> or{" "}
                    <strong className="text-zinc-200">Mobile (Mobilewright)</strong>. Platform cannot be changed later.
                  </QuickStep>
                  <QuickStep n={2} title="Setup">
                    In the project workspace, open <strong className="text-zinc-200">Setup</strong>: save your OpenAI
                    key, choose an execution provider (local, Sauce Labs, BrowserStack, LambdaTest, or custom hub), and
                    create at least one environment — base URL and browser for web, or bundle ID and device settings for
                    mobile.
                  </QuickStep>
                  <QuickStep n={3} title="Add a requirement">
                    Under <strong className="text-zinc-200">Requirements</strong>, paste acceptance criteria or user
                    stories. Generate a validated test plan with cases and steps.
                  </QuickStep>
                  <QuickStep n={4} title="Page objects">
                    Open <strong className="text-zinc-200">Recorder</strong>: capture the page or device tree, select
                    elements, and save page object files. For web, you can record in the browser panel; for mobile,
                    connect to a simulator and parse the tree. Review files under{" "}
                    <strong className="text-zinc-200">Page objects</strong> or <strong className="text-zinc-200">Framework</strong>.
                  </QuickStep>
                  <QuickStep n={5} title="Generate & run">
                    In <strong className="text-zinc-200">Test plans</strong>, generate Playwright or Mobilewright specs
                    for a suite. Open <strong className="text-zinc-200">Test execution</strong>, select spec files, and
                    click Run. Logs stream in the console; use <strong className="text-zinc-200">Test reports</strong>{" "}
                    for HTML report and history when the run finishes.
                  </QuickStep>
                </ol>
              </DocSection>

              <DocSection id="workspace" title="Project workspace">
                <p>Each project has a left navigation rail. Tabs are the same for web and mobile; labels adapt where needed:</p>
                <dl className="mt-4 space-y-4">
                  <WorkspaceItem
                    name="Overview"
                    body="Counts and shortcuts to other tabs."
                  />
                  <WorkspaceItem
                    name="Setup"
                    body="Project OpenAI key, execution provider credentials, and environment definitions (web or mobile JSON)."
                  />
                  <WorkspaceItem
                    name="Requirements"
                    body="Store product intent; generate and manage test plans per requirement."
                  />
                  <WorkspaceItem
                    name="Recorder"
                    body="Web: browser DOM capture (including iframes and shadow DOM). Mobile: device tree capture and element pick."
                  />
                  <WorkspaceItem
                    name="Page objects"
                    body="Browse and edit page object classes from the recorder or test codegen."
                  />
                  <WorkspaceItem
                    name="Test plans"
                    body="Browse generated plans, cases, and codegen; trigger spec generation for a suite."
                  />
                  <WorkspaceItem
                    name="Test execution"
                    body="Select specs, optional environment override and grep filter, run tests with live logs. Stop, rerun all, or rerun failures."
                  />
                  <WorkspaceItem
                    name="Test reports"
                    body="Open the HTML report and browse past runs for the project."
                  />
                  <WorkspaceItem
                    name="Framework"
                    body="View and download generated files synced to disk (tests, pageobjects, support, config)."
                  />
                </dl>
              </DocSection>

              <DocSection id="requirements" title="Requirements & test plans">
                <p>
                  Write clear requirements: user flows, edge cases, and expected outcomes. The AI returns a structured
                  plan (suites, cases, steps) validated before it is saved. Step actions differ slightly by platform (for
                  example web supports frame/tab switching; mobile uses tap, swipe, and device-specific actions).
                </p>
                <ul className="mt-3 list-disc space-y-2 pl-5 text-zinc-300">
                  <li>One requirement can have multiple test plans over time.</li>
                  <li>Open a plan to review cases before generating code.</li>
                  <li>
                    Generation uses the project OpenAI key from Setup; if missing, you will see an error asking you to
                    configure it.
                  </li>
                </ul>
              </DocSection>

              <DocSection id="page-objects" title="Page objects & recorder">
                <h3 className="text-base font-semibold text-white">Web recorder (Playwright)</h3>
                <p className="mt-2">
                  Open a URL (or use your environment base URL), capture the DOM, and select elements. Locators are
                  stored in page object classes and resolved via shared{" "}
                  <code className="font-mono text-xs text-zinc-400">webLocator</code> helpers — including nested{" "}
                  <code className="font-mono text-xs text-zinc-400">frame</code> and{" "}
                  <code className="font-mono text-xs text-zinc-400">shadowHost</code> chains when you record inside
                  iframes or shadow DOM.
                </p>

                <h3 className="mt-6 text-base font-semibold text-white">Mobile recorder (Mobilewright)</h3>
                <p className="mt-2">
                  Select an environment, capture the accessibility tree from the connected simulator or emulator, pick
                  nodes, and save a screen page object per view. Locators use the shared{" "}
                  <code className="font-mono text-xs text-zinc-400">locate</code> helper in the mobile framework.
                </p>

                <p className="mt-4 text-sm text-zinc-500">
                  Generated tests should call page object methods — not inline locators — so healing and refactors stay
                  localized.
                </p>
              </DocSection>

              <DocSection id="tests" title="Generate & run tests">
                <h3 className="text-base font-semibold text-white">Codegen</h3>
                <p className="mt-2">
                  From Test plans, generate TypeScript specs that import your page objects and project fixtures. Web
                  projects emit Playwright tests; mobile projects emit Mobilewright tests. Files are written into the
                  project framework folder and synced to disk.
                </p>

                <h3 className="mt-6 text-base font-semibold text-white">Test execution</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5 text-zinc-300">
                  <li>Pick one or more spec files from the list (or Select all).</li>
                  <li>
                    <strong className="text-zinc-200">Environment</strong> — leave default to use values from{" "}
                    <code className="font-mono text-xs text-zinc-400">playwright.config.ts</code> or{" "}
                    <code className="font-mono text-xs text-zinc-400">mobilewright.config.ts</code>, or pick a specific
                    saved environment.
                  </li>
                  <li>
                    Optional <strong className="text-zinc-200">grep</strong> filter (e.g.{" "}
                    <code className="font-mono text-xs text-zinc-400">@smoke</code>) to run a subset of tests.
                  </li>
                  <li>
                    Click <strong className="text-zinc-200">Run</strong> — logs poll until the run passes, fails, or is
                    stopped. Use <strong className="text-zinc-200">Rerun all</strong> or{" "}
                    <strong className="text-zinc-200">Rerun failures</strong> after a completed run.
                  </li>
                  <li>Only one active run per project at a time.</li>
                </ul>

                <h3 className="mt-6 text-base font-semibold text-white">Heal (mobile & web)</h3>
                <p className="mt-2">
                  After a failed run, you can trigger <strong className="text-zinc-200">Heal</strong> to send failure
                  context to the model and patch affected spec and page object files on disk, then rerun.
                </p>
              </DocSection>

              <DocSection id="framework" title="Framework on disk">
                <p>Each project maps to an isolated folder under the repo&apos;s frameworks directory:</p>
                <ul className="mt-3 list-disc space-y-2 pl-5 font-mono text-xs text-zinc-400">
                  <li>frameworks/web/&lt;project-id&gt;/ — Playwright web projects</li>
                  <li>frameworks/mobile/&lt;project-id&gt;/ — Mobilewright mobile projects</li>
                </ul>
                <p className="mt-4">Typical contents (both platforms):</p>
                <ul className="mt-2 list-disc space-y-2 pl-5 font-mono text-xs text-zinc-400">
                  <li>tests/ — generated spec files</li>
                  <li>pageobjects/ — page/screen classes</li>
                  <li>support/ — fixtures, locate helpers, actions</li>
                  <li>playwright.config.ts or mobilewright.config.ts — runner and environment defaults</li>
                </ul>
                <p className="mt-3">
                  Download a zip from the Framework tab for CI, or run{" "}
                  <code className="font-mono text-xs text-zinc-400">npm test</code> /{" "}
                  <code className="font-mono text-xs text-zinc-400">npx playwright test</code> inside that folder
                  locally.
                </p>
              </DocSection>

              <DocSection id="tips" title="Tips & troubleshooting">
                <ul className="list-disc space-y-3 pl-5 text-zinc-300">
                  <li>
                    <strong className="text-zinc-200">Generation fails with 503</strong> — Add or verify the OpenAI API
                    key in Setup for this project.
                  </li>
                  <li>
                    <strong className="text-zinc-200">No spec files listed</strong> — Generate tests first; specs must
                    exist under <code className="font-mono text-xs">tests/</code>.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Run hangs on install</strong> — First run installs npm dependencies
                    in the framework folder; watch the live log for progress.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Web: navigation or timeout errors</strong> — Check{" "}
                    <code className="font-mono text-xs">baseURL</code> in the environment and that the app is reachable
                    from the runner machine.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Mobile: simulator not found</strong> — Boot the correct iOS
                    simulator or Android emulator and align bundle ID / platform in your environment.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Cloud runs</strong> — Configure provider username and access key in
                    Setup; execution writes a generated <code className="font-mono text-xs">.env.execution</code> at run
                    time.
                  </li>
                  <li>
                    <strong className="text-zinc-200">Wrong platform tools</strong> — Web projects use Playwright only;
                    mobile projects use Mobilewright. Create a separate project if you need both targets.
                  </li>
                </ul>
              </DocSection>

              <div className="rounded-2xl border border-accent/25 bg-gradient-to-br from-accent/10 via-midnight-900/90 to-midnight-950 px-6 py-8 text-center">
                <h2 className="text-xl font-semibold text-white">Ready to try it?</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-zinc-400">
                  Sign in with your account, or register with an invite from your admin.
                </p>
                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  <Link href="/login" className="ui-btn-primary px-5 py-2.5">
                    Sign in
                  </Link>
                  <Link href="/" className="ui-btn-secondary px-5 py-2.5">
                    Back to home
                  </Link>
                </div>
              </div>
            </article>
          </div>
        </div>
      </main>
    </>
  );
}

function DocNav() {
  return (
    <nav className="hidden lg:block" aria-label="On this page">
      <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">On this page</p>
      <ul className="mt-3 space-y-1 border-l border-white/10">
        {SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              className="block border-l-2 border-transparent py-1.5 pl-3 text-sm text-zinc-500 transition hover:border-accent/40 hover:text-accent"
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function DocSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="text-xl font-semibold tracking-tight text-white md:text-2xl">{title}</h2>
      <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-400">{children}</div>
    </section>
  );
}

function QuickStep({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/15 font-mono text-sm font-semibold text-accent">
        {n}
      </span>
      <div>
        <h3 className="font-semibold text-white">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-zinc-400">{children}</p>
      </div>
    </li>
  );
}

function WorkspaceItem({ name, body }: { name: string; body: string }) {
  return (
    <div className="rounded-xl border border-white/[0.06] bg-midnight-900/50 px-4 py-3">
      <dt className="font-semibold text-zinc-200">{name}</dt>
      <dd className="mt-1 text-sm text-zinc-400">{body}</dd>
    </div>
  );
}

function PlatformRow({
  topic,
  web,
  mobile,
}: {
  topic: string;
  web: string;
  mobile: string;
}) {
  return (
    <tr className="border-b border-white/[0.04] last:border-0">
      <td className="px-4 py-3 font-medium text-zinc-200">{topic}</td>
      <td className="px-4 py-3 text-zinc-400">{web}</td>
      <td className="px-4 py-3 text-zinc-400">{mobile}</td>
    </tr>
  );
}
