"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  labelForTestStepActionForPlatform,
  type ProjectPlatformType,
  testStepActionGroupsForPlatform,
  testStepActionsForSelectForPlatform,
  type TestCase,
  type TestStep,
  type TestStepAction,
} from "@jagadeeshqtsolv/core";
import { testRunnerDisplayName } from "@/lib/test-framework";

const inputClass =
  "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-xs outline-none focus:border-green-400 focus:ring-2 focus:ring-green-400/20";
const smallInputClass =
  "mt-0.5 w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 shadow-xs outline-none focus:border-green-400 focus:ring-1 focus:ring-green-400/20";
const labelClass = "block text-xs font-semibold text-slate-600";
const codeClass =
  "mt-1.5 max-h-32 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-2.5 font-mono text-[10px] leading-relaxed text-emerald-700";


export type PageObjectOption = {
  className: string;
  screenName: string | null;
  methodSummary: string;
};

function methodsFromSummary(summary: string): string[] {
  return summary
    .split(",")
    .map((m) => m.trim())
    .map((m) => (m.endsWith("()") ? m.slice(0, -2).trim() : m))
    .filter((m) => m.length > 0);
}

function valuePlaceholderForAction(action: string): string {
  switch (action) {
    case "fill":
    case "typeText":
      return "Text to enter";
    case "clear":
      return "(optional)";
    case "wait":
      return "Milliseconds, e.g. 2000";
    case "swipe":
    case "pullToRefresh":
      return "up | down | left | right";
    case "scrollIntoView":
      return "up | down (optional)";
    case "pressButton":
      return "BACK | HOME | ENTER | …";
    case "openDeepLink":
      return "myapp://path or in-app route";
    case "openUrl":
      return "https://… or app-specific URL";
    case "longPress":
      return "Duration ms (optional)";
    case "tapAt":
      return "x,y e.g. 120,400";
    case "launchApp":
    case "terminateApp":
      return "Bundle id, e.g. com.example.app";
    case "setOrientation":
      return "portrait | landscape";
    case "gesture":
      return "Describe gesture or PO method name";
    case "screenshot":
      return "Filename hint (optional)";
    case "waitForVisible":
    case "waitForHidden":
      return "Timeout ms (optional)";
    default:
      return "Optional";
  }
}

function assertionPlaceholderForAction(action: string): string {
  switch (action) {
    case "assertText":
    case "assertContainsText":
      return "Expected text";
    case "assertValue":
      return "Expected field value";
    case "assertChecked":
    case "assertSelected":
    case "assertFocused":
      return "true or false";
    case "assertCount":
      return "Number, e.g. 3";
    default:
      return "Optional";
  }
}

function linesFromTextarea(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

function tagsFromInput(value: string): string[] {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

function newStepId(existing: TestStep[]): string {
  let n = existing.length + 1;
  while (existing.some((s) => s.id === `step${n}`)) {
    n += 1;
  }
  return `step${n}`;
}

function screenLabel(po: PageObjectOption): string {
  return po.screenName?.trim() || po.className;
}

export function draftFromTestCase(testCase: TestCase): TestCase {
  return structuredClone(testCase);
}

export function slugifyTestCaseId(title: string, existingIds: Iterable<string>): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  const seed = base.length > 0 ? base : "new-test-case";
  const ids = new Set(existingIds);
  let id = seed;
  let n = 2;
  while (ids.has(id)) {
    id = `${seed}-${n}`;
    n += 1;
  }
  return id;
}

export function newTestCaseDraft(
  existingIds: string[],
  platformType: ProjectPlatformType = "mobile",
): TestCase {
  const isWeb = platformType === "web";
  return {
    id: slugifyTestCaseId("new-test-case", existingIds),
    title: "",
    priority: "P1",
    platforms: isWeb ? ["chrome"] : ["ios", "android"],
    preconditions: [],
    tags: [],
    steps: [{ id: "step1", action: "tap", targetDescription: "" }],
  };
}

export function TestCaseEditForm({
  draft,
  disabled,
  onChange,
  onSubmit,
  onCancel,
  isNew = false,
  existingCaseIds = [],
  submitLabel,
  projectId,
  platformType = "mobile",
  pageObjects = [],
}: {
  draft: TestCase;
  disabled: boolean;
  onChange: (next: TestCase) => void;
  onSubmit: (saved: TestCase) => void;
  onCancel: () => void;
  isNew?: boolean;
  existingCaseIds?: string[];
  submitLabel?: string;
  projectId: string;
  platformType?: ProjectPlatformType;
  pageObjects?: PageObjectOption[];
}) {
  const isWeb = platformType === "web";
  const runnerLabel = testRunnerDisplayName(platformType);
  const stepActionGroups = testStepActionGroupsForPlatform(platformType);
  const labelStepAction = (action: string) => labelForTestStepActionForPlatform(action, platformType);
  const [preconditionsText, setPreconditionsText] = useState(draft.preconditions.join("\n"));
  const [tagsText, setTagsText] = useState(draft.tags.join(", "));
  const [codePreview, setCodePreview] = useState<{
    stepInnerLines: string[];
    testBlock: string;
  } | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);

  function update(partial: Partial<TestCase>) {
    onChange({ ...draft, ...partial });
  }

  function updateStep(index: number, partial: Partial<TestStep>) {
    const steps = draft.steps.map((step, i) => (i === index ? { ...step, ...partial } : step));
    update({ steps });
  }

  function addStep() {
    update({
      steps: [
        ...draft.steps,
        { id: newStepId(draft.steps), action: "tap", targetDescription: "" },
      ],
    });
  }

  function removeStep(index: number) {
    if (draft.steps.length <= 1) return;
    update({ steps: draft.steps.filter((_, i) => i !== index) });
  }

  function methodsForScreen(screenName: string | undefined): string[] {
    if (screenName === undefined || screenName.trim().length === 0) {
      return [];
    }
    const needle = screenName.trim().toLowerCase();
    const po = pageObjects.find(
      (p) =>
        p.className.toLowerCase() === needle ||
        (p.screenName?.trim().toLowerCase() ?? "") === needle ||
        screenLabel(p).toLowerCase() === needle,
    );
    if (po === undefined) {
      return [];
    }
    return methodsFromSummary(po.methodSummary);
  }

  useEffect(() => {
    if (draft.title.trim().length === 0 || draft.steps.some((s) => s.targetDescription.trim().length === 0)) {
      setCodePreview(null);
      return;
    }

    const timer = setTimeout(() => {
      setPreviewBusy(true);
      void fetch(`/api/projects/${projectId}/preview-test-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ testCase: draft }),
      })
        .then(async (res) => {
          if (!res.ok) {
            setCodePreview(null);
            return;
          }
          const data = (await res.json()) as { stepInnerLines: string[]; testBlock: string };
          setCodePreview(data);
        })
        .catch(() => setCodePreview(null))
        .finally(() => setPreviewBusy(false));
    }, 400);

    return () => clearTimeout(timer);
  }, [draft, projectId]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const preconditions = linesFromTextarea(preconditionsText);
    const tags = tagsFromInput(tagsText);
    const steps = draft.steps.map((step) => ({
      ...step,
      targetDescription: step.targetDescription.trim(),
      screenName: step.screenName?.trim() || undefined,
      pageObjectMethod: (() => {
        const raw = step.pageObjectMethod?.trim() ?? "";
        if (raw.length === 0) return undefined;
        return raw.endsWith("()") ? raw.slice(0, -2).trim() : raw;
      })(),
      locatorHint: step.locatorHint?.trim() || undefined,
      value: step.value?.trim() || undefined,
      assertion: step.assertion?.trim() || undefined,
      customCode: step.customCode?.trim() || undefined,
    }));

    if (draft.title.trim().length === 0) return;
    if (steps.some((s) => s.targetDescription.length === 0)) return;
    if (!isWeb && draft.platforms.length === 0) return;

    const title = draft.title.trim();
    const rawId = draft.id.trim();
    let id = draft.id;
    if (isNew) {
      const defaultId = slugifyTestCaseId("new-test-case", existingCaseIds);
      const useTitleSlug = title.length > 0 && rawId === defaultId;
      id = useTitleSlug
        ? slugifyTestCaseId(title, existingCaseIds)
        : slugifyTestCaseId(rawId || title || "new-test-case", existingCaseIds);
    }

    const saved: TestCase = {
      ...draft,
      id,
      title,
      preconditions,
      tags,
      steps,
    };
    onChange(saved);
    onSubmit(saved);
  }

  const primaryLabel = submitLabel ?? (isNew ? "Add test case" : "Save changes");

  return (
    <form className="space-y-4 border-t border-white/5 px-3 pb-3 pt-3" onSubmit={handleSubmit} data-testid="test-case-edit-form">
      {isNew ? (
        <label className="block text-xs font-medium text-zinc-400">
          Case id
          <input
            value={draft.id}
            disabled={disabled}
            onChange={(e) => update({ id: e.target.value })}
            required
            maxLength={200}
            pattern="[a-zA-Z0-9._-]+"
            title="Letters, numbers, dots, underscores, hyphens"
            className={`${inputClass} font-mono text-xs`}
            placeholder="auto-generated from title if left as default"
            data-testid="test-case-id-input"
          />
        </label>
      ) : null}
      <label className={labelClass}>
        Title
        <input value={draft.title} disabled={disabled} onChange={(e) => update({ title: e.target.value })}
          required maxLength={500} className={inputClass} data-testid="test-case-title-input" />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Priority
          <select value={draft.priority} disabled={disabled}
            onChange={(e) => update({ priority: e.target.value as TestCase["priority"] })}
            className={inputClass} data-testid="test-case-priority-select">
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
          </select>
        </label>
        <fieldset>
          <legend className={`${labelClass} mb-1.5`}>Platforms</legend>
          <div className="flex flex-wrap gap-2">
            {(isWeb ? (["chrome", "firefox", "safari", "edge"] as const) : (["ios", "android"] as const)).map((platform) => (
              <label key={platform} className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <input type="checkbox" disabled={disabled} checked={draft.platforms.includes(platform)}
                  onChange={(e) => { const next = e.target.checked ? [...draft.platforms, platform] : draft.platforms.filter((p) => p !== platform); update({ platforms: next }); }}
                  className="h-3.5 w-3.5 rounded" />
                {platform}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className={labelClass}>
          Preconditions (one per line)
          <textarea value={preconditionsText} disabled={disabled} onChange={(e) => setPreconditionsText(e.target.value)}
            rows={2} className={inputClass} placeholder="User is on Catalog page"
            data-testid="test-case-preconditions-textarea" />
        </label>
        <label className={labelClass}>
          Tags (comma-separated)
          <input value={tagsText} disabled={disabled} onChange={(e) => setTagsText(e.target.value)}
            className={inputClass} placeholder="navigation, menu" data-testid="test-case-tags-input" />
        </label>
      </div>

      {/* Test Steps */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className={labelClass}>Test Steps</p>
          <button type="button" disabled={disabled} onClick={addStep}
            className="inline-flex items-center gap-1 rounded-lg border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-semibold text-green-700 hover:bg-green-100 disabled:opacity-40"
            data-testid="test-case-add-step-btn">
            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg> Add Step
          </button>
        </div>
        <div className="space-y-3">
          {draft.steps.map((step, index) => {
            const screenMethods = methodsForScreen(step.screenName);
            const stepPreview = codePreview?.stepInnerLines[index];
            return (
              <div key={step.id} className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                {/* Step header */}
                <div className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-slate-200 text-[10px] font-bold text-slate-600">{index + 1}</span>
                  <p className="flex-1 text-xs font-semibold text-slate-700">
                    {labelStepAction(step.action)}{step.targetDescription ? ` — ${step.targetDescription}` : ""}
                  </p>
                  <button type="button" disabled={disabled || draft.steps.length <= 1} onClick={() => removeStep(index)}
                    className="flex h-6 w-6 items-center justify-center rounded text-rose-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30"
                    data-testid={`test-case-remove-step-btn-${index}`}>
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>

                {/* Step fields */}
                <div className="space-y-2.5 p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={labelClass}>
                      Action
                      <select value={step.action} disabled={disabled}
                        onChange={(e) => updateStep(index, { action: e.target.value as TestStepAction })}
                        className={smallInputClass}>
                        {(() => {
                          const options = testStepActionsForSelectForPlatform(step.action, platformType);
                          const known = new Set(stepActionGroups.flatMap((g) => g.actions as readonly string[]));
                          const unknown = options.filter((a) => !known.has(a));
                          return (<>
                            {unknown.map((action) => <option key={action} value={action}>{labelStepAction(action)} (legacy)</option>)}
                            {stepActionGroups.map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.actions.map((action) => <option key={action} value={action}>{labelStepAction(action)}</option>)}
                              </optgroup>
                            ))}
                          </>);
                        })()}
                      </select>
                    </label>
                    <label className={labelClass}>
                      Target description <span className="text-rose-500">*</span>
                      <input value={step.targetDescription} disabled={disabled} required
                        onChange={(e) => updateStep(index, { targetDescription: e.target.value })}
                        placeholder="e.g. Login button, Email field" className={smallInputClass} />
                    </label>
                  </div>

                  {/* Page object mapping — primary code generation path */}
                  <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-2.5">
                    <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                      {isWeb ? "Page Object" : "Screen Object"}
                    </p>

                    {pageObjects.length === 0 ? (
                      /* No page objects created yet */
                      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                        <p className="text-xs font-semibold text-amber-800">No page objects found</p>
                        <p className="mt-0.5 text-[11px] text-amber-700">
                          Go to the <strong>Page Objects</strong> tab to capture screens and add methods. Then come back to link them here for precise code generation.
                        </p>
                        <label className={`${labelClass} mt-2`}>
                          Use locator instead <span className="font-normal text-slate-400">(CSS selector or test ID)</span>
                          <input value={step.locatorHint ?? ""} disabled={disabled}
                            onChange={(e) => updateStep(index, { locatorHint: e.target.value })}
                            placeholder="e.g. #submit-btn, [data-testid='login']"
                            className={smallInputClass} />
                        </label>
                      </div>
                    ) : (
                      <>
                        {/* Page/Screen selector */}
                        <label className={labelClass}>
                          Select {isWeb ? "page" : "screen"}
                          <select value={step.screenName ?? ""} disabled={disabled}
                            onChange={(e) => { const s = e.target.value.length > 0 ? e.target.value : undefined; updateStep(index, { screenName: s, pageObjectMethod: undefined }); }}
                            className={smallInputClass}>
                            <option value="">— Choose a {isWeb ? "page" : "screen"} —</option>
                            {pageObjects.map((po) => <option key={po.className} value={screenLabel(po)}>{screenLabel(po)}</option>)}
                          </select>
                        </label>

                        {step.screenName ? (
                          screenMethods.length > 0 ? (
                            /* Methods available → method selector */
                            <label className={labelClass}>
                              Select method <span className="text-green-600 font-normal">✓ generates precise code</span>
                              <select value={step.pageObjectMethod ?? ""} disabled={disabled}
                                onChange={(e) => updateStep(index, { pageObjectMethod: e.target.value.length > 0 ? e.target.value : undefined })}
                                className={`${smallInputClass} border-green-300 focus:border-green-400`}>
                                <option value="">— Choose a method —</option>
                                {screenMethods.map((method) => { const v = method.endsWith("()") ? method.slice(0, -2) : method; return <option key={v} value={v}>{v}()</option>; })}
                              </select>
                            </label>
                          ) : (
                            /* Page object exists but methodSummary is out of sync in DB */
                            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5">
                              <p className="text-xs font-semibold text-amber-800">Methods not synced yet</p>
                              <p className="mt-0.5 text-[11px] text-amber-700">
                                The page object file may already have methods (the generated code confirms this). To make them appear here:
                              </p>
                              <ol className="mt-1.5 list-decimal pl-4 text-[11px] text-amber-700 space-y-0.5">
                                <li>Go to <strong>Page Objects</strong> tab</li>
                                <li>Click <strong>Open Editor</strong> → select this page class</li>
                                <li>Click <strong>Save Changes</strong> (even without editing)</li>
                                <li>Come back here — methods will appear</li>
                              </ol>
                              <label className={`${labelClass} mt-2.5`}>
                                Or type the method name directly
                                <input
                                  value={step.pageObjectMethod ?? ""}
                                  disabled={disabled}
                                  onChange={(e) => updateStep(index, { pageObjectMethod: e.target.value.length > 0 ? e.target.value : undefined })}
                                  placeholder="e.g. expectOR2Visible, clickLogin"
                                  className={smallInputClass}
                                />
                              </label>
                            </div>
                          )
                        ) : (
                          /* No page selected yet */
                          <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2">
                            <p className="text-[11px] text-slate-500">
                              Select a {isWeb ? "page" : "screen"} to use its methods for precise code generation, or skip and use a locator below.
                            </p>
                            <label className={`${labelClass} mt-2`}>
                              Locator hint <span className="font-normal text-slate-400">(optional fallback)</span>
                              <input value={step.locatorHint ?? ""} disabled={disabled}
                                onChange={(e) => updateStep(index, { locatorHint: e.target.value })}
                                placeholder="e.g. #submit-btn, [data-testid='login']"
                                className={smallInputClass} />
                            </label>
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    <label className={labelClass}>
                      Value <span className="font-normal text-slate-400">(optional)</span>
                      <input value={step.value ?? ""} disabled={disabled}
                        onChange={(e) => updateStep(index, { value: e.target.value })}
                        placeholder={valuePlaceholderForAction(step.action)} className={smallInputClass} />
                    </label>
                    <label className={labelClass}>
                      Assertion <span className="font-normal text-slate-400">(optional)</span>
                      <input value={step.assertion ?? ""} disabled={disabled}
                        onChange={(e) => updateStep(index, { assertion: e.target.value })}
                        placeholder={assertionPlaceholderForAction(step.action)} className={smallInputClass} />
                    </label>
                  </div>

                  <label className={labelClass}>
                    Custom code <span className="font-normal text-slate-400">(optional — overrides generated step)</span>
                    <textarea value={step.customCode ?? ""} disabled={disabled} rows={2}
                      onChange={(e) => updateStep(index, { customCode: e.target.value })}
                      placeholder="await catalogScreen.expectProductsVisible();"
                      className={`${smallInputClass} font-mono`} />
                  </label>

                  {stepPreview && <pre className={codeClass}>{stepPreview}</pre>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {codePreview && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
          <p className="mb-1.5 text-[11px] font-semibold text-emerald-700">
            {runnerLabel} preview {previewBusy ? "— updating…" : ""}
          </p>
          <pre className={`${codeClass} max-h-48 bg-white`}>{codePreview.testBlock}</pre>
        </div>
      )}

      <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
        <button type="submit" disabled={disabled} className="ui-btn-primary ui-btn-sm" data-testid="test-case-submit-btn">
          {disabled ? "Saving…" : primaryLabel}
        </button>
        <button type="button" disabled={disabled} onClick={onCancel} className="ui-btn-secondary ui-btn-sm" data-testid="test-case-cancel-btn">
          Cancel
        </button>
      </div>
    </form>
  );
}
