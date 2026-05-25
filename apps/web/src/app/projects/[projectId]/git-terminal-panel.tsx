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
        className="fixed inset-0 z-40 bg-ink-950"
        onClick={onClose}
        aria-hidden
      />

      {/* Panel */}
      <aside
        className="fixed inset-y-0 left-0 z-50 flex w-full max-w-sm flex-col bg-ink-900 shadow-2xl ring-1 ring-white/10 sm:left-[72px]"
        role="dialog"
        aria-label="Git terminal"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Git Terminal</h2>
            <p className="text-[11px] text-zinc-500">Run git commands in the project directory</p>
          </div>
          <div className="flex items-center gap-1.5">
            {lines.length > 0 && (
              <button
                type="button"
                onClick={() => setLines([])}
                className="rounded-lg px-2 py-1 text-[11px] text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-300"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/[0.06] hover:text-white"
              aria-label="Close"
            >
              <CloseIcon />
            </button>
          </div>
        </div>

        {/* Quick commands */}
        <div className="flex flex-wrap gap-1 border-b border-white/[0.06] px-4 py-2">
          {QUICK_COMMANDS.map((cmd) => (
            <button
              key={cmd}
              type="button"
              disabled={running}
              onClick={() => void run(cmd)}
              className="rounded-md bg-white/[0.04] px-2 py-1 font-mono text-[10px] text-zinc-400 hover:bg-white/[0.08] hover:text-zinc-200 disabled:opacity-40 transition"
            >
              {cmd}
            </button>
          ))}
        </div>

        {/* Output */}
        <div
          ref={outputRef}
          className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 font-mono text-xs"
        >
          {lines.length === 0 ? (
            <p className="text-zinc-600 select-none">No output yet — type a command below.</p>
          ) : (
            lines.map((line) => (
              <div key={line.id} className="space-y-1">
                {/* Command echo */}
                <div className="flex items-center gap-1.5 text-zinc-500">
                  <span className="text-accent">$</span>
                  <span className="text-zinc-300">git {line.command.replace(/^git\s+/, "")}</span>
                </div>
                {/* stdout */}
                {line.stdout && (
                  <pre className="whitespace-pre-wrap break-all text-zinc-300 leading-relaxed">
                    {line.stdout}
                  </pre>
                )}
                {/* stderr */}
                {line.stderr && (
                  <pre className={`whitespace-pre-wrap break-all leading-relaxed ${
                    line.exitCode !== 0 ? "text-rose-400" : "text-amber-400/80"
                  }`}>
                    {line.stderr}
                  </pre>
                )}
                {/* No output */}
                {!line.stdout && !line.stderr && (
                  <span className="text-zinc-600 italic">
                    {line.exitCode === 0 ? "(no output)" : `(exited with code ${line.exitCode})`}
                  </span>
                )}
              </div>
            ))
          )}

          {running && (
            <div className="flex items-center gap-2 text-zinc-500">
              <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-white/10 border-t-zinc-400" />
              Running…
            </div>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-white/10 p-3">
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-3 py-2 focus-within:border-accent/40">
            <span className="shrink-0 font-mono text-xs font-semibold text-accent">git</span>
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
              className="min-w-0 flex-1 bg-transparent font-mono text-xs text-zinc-200 placeholder-zinc-600 focus:outline-none disabled:opacity-50"
            />
            <button
              type="button"
              onClick={() => void run(input)}
              disabled={running || !input.trim()}
              className="shrink-0 rounded-md bg-accent/20 px-2 py-0.5 text-[10px] font-semibold text-accent hover:bg-accent/30 disabled:opacity-40 transition"
            >
              Run
            </button>
          </div>
          <p className="mt-1.5 px-1 text-[10px] text-zinc-600">
            ↑↓ history · Enter to run · prefix &quot;git&quot; optional
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
