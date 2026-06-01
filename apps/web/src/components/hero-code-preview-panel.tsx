/**
 * Hero code sample — uses a styled div instead of <pre><code> so browser
 * extensions (e.g. Sider) do not inject nodes before hydration.
 */
export function HeroCodePreviewPanel() {
  return (
    <div className="relative rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/80 ring-1 ring-slate-100">
      {/* macOS window chrome */}
      <div className="flex items-center gap-1.5 rounded-t-2xl border-b border-slate-100 bg-slate-50 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-green-400" />
        <span className="ml-auto rounded-md border border-slate-200 bg-white px-2 py-0.5 font-mono text-[10px] text-slate-400">
          login.spec.ts
        </span>
      </div>
      {/* Code body */}
      <div
        className="overflow-x-auto whitespace-pre p-5 font-mono text-[12px] leading-relaxed sm:text-[13px]"
        aria-label="Sample Playwright test code"
      >
        <span className="text-violet-600">import</span>
        {" { test } "}
        <span className="text-violet-600">from</span>{" "}
        <span className="text-green-600">&quot;../support/fixtures&quot;</span>
        {"\n\n"}
        <span className="text-slate-400">{"// generated: requirement → plan → POM → spec"}</span>
        {"\n"}
        <span className="text-blue-600">test</span>
        <span className="text-slate-600">(</span>
        <span className="text-amber-600">&quot;Login with valid credentials&quot;</span>
        <span className="text-slate-600">{", async ({ loginPage }) => {"}</span>
        {"\n  "}
        <span className="text-violet-600">await</span>{" "}
        <span className="text-slate-700">loginPage</span>
        <span className="text-slate-500">.fillEmail(</span>
        <span className="text-amber-600">user</span>
        <span className="text-slate-500">)</span>
        {"\n  "}
        <span className="text-violet-600">await</span>{" "}
        <span className="text-slate-700">loginPage</span>
        <span className="text-slate-500">.fillPassword(</span>
        <span className="text-amber-600">password</span>
        <span className="text-slate-500">)</span>
        {"\n  "}
        <span className="text-violet-600">await</span>{" "}
        <span className="text-slate-700">loginPage</span>
        <span className="text-slate-500">.submit()</span>
        {"\n  "}
        <span className="text-violet-600">await</span>{" "}
        <span className="text-blue-600">expect</span>
        <span className="text-slate-500">(page).toHaveURL(</span>
        <span className="text-amber-600">&quot;/dashboard&quot;</span>
        <span className="text-slate-500">)</span>
        {"\n"}
        <span className="text-slate-600">{"});"}</span>
      </div>
      {/* Status bar */}
      <div className="flex items-center justify-between rounded-b-2xl border-t border-slate-100 bg-slate-50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-[11px] font-medium text-slate-600">1 passed · 320ms</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">Playwright · Chromium</span>
      </div>
    </div>
  );
}
