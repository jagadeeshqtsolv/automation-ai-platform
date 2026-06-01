"use client";

import { useState } from "react";
import { useToast } from "@/components/toast-provider";

const NPM_PACKAGE = "@jagadeeshqtsolv/web-support";

type Step = {
  number: number;
  title: string;
  description: string;
  code?: string;
  note?: string;
};

const STEPS: Step[] = [
  {
    number: 1,
    title: "Install the npm library",
    description: "Open your terminal and run the following command to install the page recorder globally:",
    code: `npm install -g ${NPM_PACKAGE}`,
    note: "Requires Node.js 18+ installed on your machine.",
  },
  {
    number: 2,
    title: "Run the recorder",
    description: "Start the local recorder server. It will launch a browser window automatically:",
    code: `npx ${NPM_PACKAGE}`,
    note: "Keep this terminal open while recording. The recorder runs on http://localhost:3333 by default.",
  },
  {
    number: 3,
    title: "Open the browser & navigate",
    description: "A browser window will open. Navigate to your application URL and interact with the pages you want to capture.",
    note: "The recorder tracks all page navigations and DOM elements as you browse.",
  },
  {
    number: 4,
    title: "Capture pages",
    description: "On each page you want to record, click the Capture Page button in the recorder toolbar. The recorder will snapshot all interactive elements on that page.",
    note: "Repeat this for every page or screen you want to generate page objects for.",
  },
  {
    number: 5,
    title: "Save the captured pages",
    description: "Once you've captured all the pages, click Save in the recorder. Your page object definitions will be bundled into a JSON file.",
  },
  {
    number: 6,
    title: "Download & import the JSON",
    description: "Download the generated JSON file from the recorder. Then import it into this platform using the Import button in the Page Objects section.",
    note: "The JSON contains all element selectors, roles, and suggested keys ready for use in your test automation.",
  },
];

function CodeBlock({ code }: { code: string }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-900 px-4 py-3">
      <code className="flex-1 font-mono text-sm text-green-400">{code}</code>
      <button
        type="button"
        onClick={handleCopy}
        className="shrink-0 rounded-md border border-slate-600 bg-slate-700 px-2.5 py-1 text-[11px] font-medium text-slate-300 transition hover:bg-slate-600"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

export function BrowserRecorderSetupPanel() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-rose-100 text-rose-700">
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
            <rect x="7" y="2.5" width="10" height="19" rx="2.5" />
            <circle cx="12" cy="18" r="1" fill="currentColor" stroke="none" />
            <circle cx="16" cy="6" r="2.25" fill="#f43f5e" stroke="none" />
          </svg>
        </div>
        <div>
          <h2 className="text-base font-semibold text-slate-900">Browser Recorder Setup</h2>
          <p className="text-xs text-slate-500">Run the recorder locally to capture page objects from your application</p>
        </div>
        <a
          href={`https://www.npmjs.com/package/${NPM_PACKAGE}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
          </svg>
          npm page
        </a>
      </div>

      {/* Steps */}
      <div className="divide-y divide-slate-100">
        {STEPS.map((step) => (
          <div key={step.number} className="flex gap-4 px-5 py-5">
            {/* Step number */}
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
              {step.number}
            </div>

            {/* Content */}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-900">{step.title}</p>
              <p className="mt-1 text-sm text-slate-500 leading-relaxed">{step.description}</p>
              {step.code !== undefined && <CodeBlock code={step.code} />}
              {step.note !== undefined && (
                <p className="mt-2 flex items-start gap-1.5 text-[11px] text-slate-400">
                  <svg className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                  {step.note}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50 px-5 py-4 rounded-b-xl">
        <p className="text-xs text-slate-500">
          After downloading the JSON, go to{" "}
          <span className="font-semibold text-slate-700">Page Objects</span> and use the{" "}
          <span className="font-semibold text-slate-700">Import</span> button to load your captured pages.
        </p>
        <a
          href={`https://www.npmjs.com/package/${NPM_PACKAGE}`}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-4 shrink-0 rounded-lg bg-violet-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-violet-700"
        >
          View on npm
        </a>
      </div>
    </section>
  );
}
