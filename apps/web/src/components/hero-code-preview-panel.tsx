/**
 * Hero code sample — uses a styled div instead of <pre><code> so browser
 * extensions (e.g. Sider) do not inject nodes before hydration.
 */
export function HeroCodePreviewPanel() {
  return (
    <div className="relative rounded-2xl border border-accent/15 bg-midnight-900/95 shadow-2xl shadow-black/60 ring-1 ring-accent/10">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
        <span className="h-2.5 w-2.5 rounded-full bg-zinc-600" />
        <span className="ml-2 font-mono text-[11px] text-zinc-500">login.spec.ts · Playwright</span>
      </div>
      <div
        className="overflow-x-auto whitespace-pre p-4 font-mono text-[11px] leading-relaxed text-zinc-400 sm:text-xs"
        aria-label="Sample Playwright test code"
      >
        <span className="text-accent">import</span> {"{ test }"}{" "}
        <span className="text-accent">from</span>{" "}
        <span className="text-accent-muted">&quot;../support/fixtures&quot;</span>
        {"\n\n"}
        <span className="text-zinc-500">test</span>
        <span className="text-zinc-300">(</span>
        <span className="text-amber-200/90">&quot;Login with valid credentials&quot;</span>
        <span className="text-zinc-300">, async (</span>
        {"{ page, loginPage }"}
        <span className="text-zinc-300">) =&gt; {"{"}</span>
        {"\n  "}
        <span className="text-zinc-500">await</span> loginPage.fillEmail(user)
        {"\n  "}
        <span className="text-zinc-500">await</span> loginPage.submit()
        {"\n"}
        <span className="text-zinc-300">{"}"});</span>
      </div>
      <div className="border-t border-white/10 bg-ink-950/60 px-4 py-3">
        <p className="text-xs text-zinc-500">
          <span className="text-accent-muted">●</span> Generated from requirement → plan → POM → spec
        </p>
      </div>
    </div>
  );
}
