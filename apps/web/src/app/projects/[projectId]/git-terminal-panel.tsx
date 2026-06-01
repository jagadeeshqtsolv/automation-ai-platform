"use client";

import { useEffect, useRef, useState } from "react";
import { Portal } from "@/components/portal";

type OutputLine = {
  id: number;
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
};

const QUICK_COMMANDS = ["status", "log --oneline -10", "diff", "branch -a", "stash list"];

let _id = 0;
function nextId() { return ++_id; }

export function GitTerminalPanel({
  projectId,
  open,
  onClose,
}: {
  projectId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [input, setInput] = useState("");
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [running, setRunning] = useState(false);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const history = useRef<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const outputRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Focus input when opened
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  // Scroll output to bottom on new lines
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  async function run(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed || running) return;

    history.current = [trimmed, ...history.current.slice(0, 49)];
    setHistoryIdx(-1);
    setInput("");
    setRunning(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/git-config/exec`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: trimmed }),
      });
      const body = (await res.json()) as { stdout: string; stderr: string; exitCode: number; error?: string };
      setLines((prev) => [
        ...prev,
        {
          id: nextId(),
          command: trimmed,
          stdout: body.stdout ?? "",
          stderr: body.stderr ?? body.error ?? "",
          exitCode: body.exitCode ?? (res.ok ? 0 : 1),
        },
      ]);
    } catch (e) {
      setLines((prev) => [
        ...prev,
        { id: nextId(), command: trimmed, stdout: "", stderr: String(e), exitCode: 1 },
      ]);
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      void run(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.current.length - 1);
      setHistoryIdx(next);
      setInput(history.current[next] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const next = historyIdx - 1;
      if (next < 0) { setHistoryIdx(-1); setInput(""); }
      else { setHistoryIdx(next); setInput(history.current[next] ?? ""); }
    }
  }

  if (!open) return null;

  return (
    <Portal>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-white"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className="fixed inset-y-0 left-0 z-50 flex w-full max-w-md flex-col bg-white shadow-xl ring-1 ring-slate-200"
        role="dialog"
        aria-label="Git Terminal"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-900 text-green-400">
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Git Terminal</h2>
              <p className="text-[11px] text-slate-500">Run git commands in the project directory</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {lines.length > 0 && (
              <button
                type="button"
                onClick={() => setLines([])}
                className="rounded-lg border border-slate-200 px-2.5 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                data-testid="git-terminal-clear-btn"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              aria-label="Close"
              data-testid="git-terminal-close-btn"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Quick commands */}
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
          <span className="self-center text-[10px] font-semibold uppercase tracking-wider text-slate-400 mr-1">Quick:</span>
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              disabled={running}
              onClick={() => void run(cmd)}
              className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-[10px] text-slate-600 shadow-xs hover:border-slate-300 hover:bg-slate-50 disabled:opacity-40 transition"
              data-testid={`git-terminal-quick-cmd-${cmd.replace(/\s+/g, "-")}`}
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Output — dark terminal area */}
        <div
          ref={outputRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-slate-900 p-4 font-mono text-xs"
        >
          {lines.length === 0 ? (
            <p className="text-slate-500 select-none">No output yet — type a command below or use a quick command above.</p>
          ) : (
            lines.map((line) => (
              <div key={line.id} className="space-y-1">
                {/* Command echo */}
                <div className="flex items-center gap-1.5">
                  <span className="text-green-400 select-none">$</span>
                  <span className="text-slate-300">git {line.command.replace(/^git\s+/, "")}</span>
                </div>
                {/* stdout */}
                {line.stdout && (
                  <pre className="whitespace-pre-wrap break-all text-slate-400 leading-relaxed pl-3 border-l-2 border-slate-700">
                    {line.stdout}
                  </pre>
                )}
                {/* stderr */}
                {line.stderr && (
                  <pre className={`whitespace-pre-wrap break-all leading-relaxed pl-3 border-l-2 ${
                    line.exitCode !== 0
                      ? "text-rose-400 border-rose-800"
                      : "text-amber-400 border-amber-800"
                  }`}>
                    {line.stderr}
                  </pre>
                )}
                {/* No output */}
                {!line.stdout && !line.stderr && (
                  <span className={`italic pl-3 ${line.exitCode === 0 ? "text-slate-600" : "text-rose-500"}`}>
                    {line.exitCode === 0 ? "(no output)" : `(exited with code ${line.exitCode})`}
                  </span>
                )}
              </div>
            ))
          )}

          {running && (
            <div className="flex items-center gap-2 text-slate-500">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-slate-700 border-t-green-500" />
              Running…
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-slate-200 bg-white p-3">
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-xs focus-within:border-green-400 focus-within:ring-2 focus-within:ring-green-400/20">
            <span className="shrink-0 font-mono text-xs font-bold text-green-700">git</span>
            <span className="shrink-0 text-slate-300 font-mono text-xs">›</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={running}
              placeholder="status"
              spellCheck={false}
              autoComplete="off"
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none disabled:opacity-50"
              data-testid="git-terminal-input"
            />
            <button
              type="button"
              onClick={() => void run(input)}
              disabled={running || !input.trim()}
              className="shrink-0 rounded-md border border-green-300 bg-accent px-2.5 py-1 text-[10px] font-semibold text-slate-900 hover:bg-accent-dim disabled:opacity-40 transition"
              data-testid="git-terminal-run-btn"
            >
              Run
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-slate-400">
            ↑↓ history · Enter to run · &quot;git&quot; prefix optional
          </p>
        </div>
      </aside>
    </Portal>
  );
}

function CloseIcon() {
  return (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}
