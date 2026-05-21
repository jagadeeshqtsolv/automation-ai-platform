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
} from "@automation-ai/shared";
import { testRunnerDisplayName } from "@/lib/test-framework";

const inputClass =
  "mt-1 w-full rounded-lg border border-white/10 bg-ink-950/60 px-3 py-2 text-sm text-white outline-none ring-accent/30 focus:ring-2";
const smallInputClass =
  "mt-0.5 w-full rounded border border-white/10 bg-ink-950/80 px-2 py-1.5 text-xs text-white";
const codeClass =
  "mt-1 max-h-32 overflow-auto rounded border border-white/10 bg-black/50 p-2 font-mono text-[10px] leading-relaxed text-emerald-200/90";

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
    <form className="space-y-4 border-t border-white/5 px-3 pb-3 pt-3" onSubmit={handleSubmit}>
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
          />
        </label>
      ) : null}
      <label className="block text-xs font-medium text-zinc-400">
        Title
        <input
          value={draft.title}
          disabled={disabled}
          onChange={(e) => update({ title: e.target.value })}
          required
          maxLength={500}
          className={inputClass}
        />
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-zinc-400">
          Priority
          <select
            value={draft.priority}
            disabled={disabled}
            onChange={(e) => update({ priority: e.target.value as TestCase["priority"] })}
            className={inputClass}
          >
            <option value="P0">P0</option>
            <option value="P1">P1</option>
            <option value="P2">P2</option>
          </select>
        </label>
        <fieldset className="text-xs font-medium text-zinc-400">
          <legend className="mb-1">Platforms</legend>
          <div className="flex gap-4 pt-1">
            {(isWeb
              ? (["chrome", "firefox", "safari", "edge"] as const)
              : (["ios", "android"] as const)
            ).map((platform) => (
              <label key={platform} className="flex items-center gap-2 font-normal text-zinc-300">
                <input
                  type="checkbox"
                  disabled={disabled}
                  checked={draft.platforms.includes(platform)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...draft.platforms, platform]
                      : draft.platforms.filter((p) => p !== platform);
                    update({ platforms: next });
                  }}
                />
                {platform}
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      <label className="block text-xs font-medium text-zinc-400">
        Preconditions (one per line)
        <textarea
          value={preconditionsText}
          disabled={disabled}
          onChange={(e) => setPreconditionsText(e.target.value)}
          rows={3}
          className={inputClass}
          placeholder="User is on Catalog page"
        />
      </label>

      <label className="block text-xs font-medium text-zinc-400">
        Tags (comma-separated)
        <input
          value={tagsText}
          disabled={disabled}
          onChange={(e) => setTagsText(e.target.value)}
          className={inputClass}
          placeholder="navigation, menu"
        />
      </label>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-zinc-400">Test steps</p>
          <button
            type="button"
            disabled={disabled}
            onClick={addStep}
            className="text-xs font-semibold text-accent hover:underline disabled:opacity-40"
          >
            + Add step
          </button>
        </div>
        {pageObjects.length > 0 ? (
          <p className="text-[11px] text-zinc-500">
            {isWeb
              ? "Pick a page to reuse page object methods, or leave blank and add custom TypeScript per step."
              : "Pick a screen to reuse page object methods, or leave blank and add custom TypeScript per step."}
          </p>
        ) : null}
        <div className="space-y-3">
          {draft.steps.map((step, index) => {
            const screenMethods = methodsForScreen(step.screenName);
            const stepPreview = codePreview?.stepInnerLines[index];
            return (
              <div
                key={step.id}
                className="space-y-2 rounded-lg border border-white/[0.08] bg-ink-950/50 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-zinc-500">{step.id}</span>
                  <button
                    type="button"
                    disabled={disabled || draft.steps.length <= 1}
                    onClick={() => removeStep(index)}
                    className="text-[11px] text-rose-300 hover:underline disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-[11px] text-zinc-500">
                    Action
                    <select
                      value={step.action}
                      disabled={disabled}
                      onChange={(e) => updateStep(index, { action: e.target.value as TestStepAction })}
                      className={smallInputClass}
                    >
                      {(() => {
                        const options = testStepActionsForSelectForPlatform(step.action, platformType);
                        const known = new Set(
                          stepActionGroups.flatMap((g) => g.actions as readonly string[]),
                        );
                        const unknown = options.filter((a) => !known.has(a));
                        return (
                          <>
                            {unknown.map((action) => (
                              <option key={action} value={action}>
                                {labelStepAction(action)} (legacy)
                              </option>
                            ))}
                            {stepActionGroups.map((group) => (
                              <optgroup key={group.label} label={group.label}>
                                {group.actions.map((action) => (
                                  <option key={action} value={action}>
                                    {labelStepAction(action)}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </>
                        );
                      })()}
                    </select>
                  </label>
                  <label className="block text-[11px] text-zinc-500">
                    {isWeb ? "Page (page object)" : "Screen (page object)"}
                    <select
                      value={step.screenName ?? ""}
                      disabled={disabled}
                      onChange={(e) => {
                        const screenName = e.target.value.length > 0 ? e.target.value : undefined;
                        updateStep(index, { screenName, pageObjectMethod: undefined });
                      }}
                      className={smallInputClass}
                    >
                      <option value="">— None —</option>
                      {pageObjects.map((po) => (
                        <option key={po.className} value={screenLabel(po)}>
                          {screenLabel(po)} ({po.className})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {screenMethods.length > 0 ? (
                  <label className="block text-[11px] text-zinc-500">
                    Page object method
                    <select
                      value={step.pageObjectMethod ?? ""}
                      disabled={disabled}
                      onChange={(e) =>
                        updateStep(index, {
                          pageObjectMethod: e.target.value.length > 0 ? e.target.value : undefined,
                        })
                      }
                      className={smallInputClass}
                    >
                      <option value="">— Auto from action + target —</option>
                      {screenMethods.map((method) => {
                        const value = method.endsWith("()") ? method.slice(0, -2) : method;
                        return (
                          <option key={value} value={value}>
                            {value}()
                          </option>
                        );
                      })}
                    </select>
                  </label>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-[11px] text-zinc-500">
                    Locator hint
                    <input
                      value={step.locatorHint ?? ""}
                      disabled={disabled}
                      onChange={(e) => updateStep(index, { locatorHint: e.target.value })}
                      className={smallInputClass}
                    />
                  </label>
                  <label className="block text-[11px] text-zinc-500">
                    Target description
                    <input
                      value={step.targetDescription}
                      disabled={disabled}
                      onChange={(e) => updateStep(index, { targetDescription: e.target.value })}
                      required
                      className={smallInputClass}
                    />
                  </label>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-[11px] text-zinc-500">
                    Value
                    <input
                      value={step.value ?? ""}
                      disabled={disabled}
                      onChange={(e) => updateStep(index, { value: e.target.value })}
                      placeholder={valuePlaceholderForAction(step.action)}
                      className={smallInputClass}
                    />
                  </label>
                  <label className="block text-[11px] text-zinc-500">
                    Assertion
                    <input
                      value={step.assertion ?? ""}
                      disabled={disabled}
                      onChange={(e) => updateStep(index, { assertion: e.target.value })}
                      placeholder={assertionPlaceholderForAction(step.action)}
                      className={smallInputClass}
                    />
                  </label>
                </div>
                <label className="block text-[11px] text-zinc-500">
                  Custom code (optional — overrides generated step)
                  <textarea
                    value={step.customCode ?? ""}
                    disabled={disabled}
                    onChange={(e) => updateStep(index, { customCode: e.target.value })}
                    rows={2}
                    placeholder="await catalogScreen.expectProductsVisible();"
                    className={smallInputClass}
                  />
                </label>
                {stepPreview ? (
                  <pre className={codeClass}>{stepPreview}</pre>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>

      {codePreview ? (
        <div className="rounded-lg border border-sky-500/20 bg-sky-950/20 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-sky-200/90">
            {runnerLabel} preview {previewBusy ? "(updating…)" : ""}
          </p>
          <pre className={`${codeClass} max-h-48`}>{codePreview.testBlock}</pre>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={disabled} className="ui-btn-primary ui-btn-sm">
          {disabled ? "Saving…" : primaryLabel}
        </button>
        <button type="button" disabled={disabled} onClick={onCancel} className="ui-btn-secondary ui-btn-sm">
          Cancel
        </button>
      </div>
    </form>
  );
}
