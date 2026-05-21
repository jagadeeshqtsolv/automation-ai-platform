"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkspaceTab } from "./project-workspace-nav";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type ChatAction = { type: "navigate"; tab: string } | { type: "highlight_run"; runId: string };

function renderSimpleMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold text-zinc-100">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

export function ProjectChatPanel({
  projectId,
  onNavigate,
  onHighlightRun,
}: {
  projectId: string;
  onNavigate: (tab: WorkspaceTab) => void;
  onHighlightRun: (runId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Project assistant — commands only affect this project. Say **help** or try **status**, **run tests**, **stop**.",
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el !== null) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, open]);

  const send = async () => {
    const text = input.trim();
    if (text.length === 0 || sending) {
      return;
    }

    const userMsg: ChatMessage = { id: `u-${Date.now()}`, role: "user", text };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const res = await fetch(`/api/projects/${projectId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text }),
      });
      const body = (await res.json()) as {
        message?: string;
        error?: string;
        actions?: ChatAction[];
      };

      if (!res.ok) {
        setMessages((prev) => [
          ...prev,
          { id: `e-${Date.now()}`, role: "assistant", text: body.error ?? "Request failed." },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: "assistant", text: body.message ?? "" },
      ]);

      for (const action of body.actions ?? []) {
        if (action.type === "navigate") {
          onNavigate(action.tab as WorkspaceTab);
        } else if (action.type === "highlight_run") {
          onHighlightRun(action.runId);
        }
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", text: "Could not reach the assistant." },
      ]);
    } finally {
      setSending(false);
    }
  };

  const chips = ["help", "status", "run tests", "stop", "rerun failures", "list specs"];

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-accent/40 bg-ink-900 text-lg shadow-lg shadow-black/40 transition hover:border-accent hover:bg-ink-950"
        aria-label={open ? "Close project assistant" : "Open project assistant"}
        title="Project assistant"
      >
        {open ? "×" : "?"}
      </button>

      {open ? (
        <div
          className="fixed bottom-20 right-6 z-40 flex w-[min(100vw-2rem,24rem)] flex-col overflow-hidden rounded-2xl border border-white/10 bg-ink-900/95 shadow-2xl backdrop-blur-md"
          role="dialog"
          aria-label="Project assistant"
        >
          <header className="border-b border-white/10 px-3 py-2">
            <p className="text-sm font-semibold text-white">Project assistant</p>
            <p className="text-[10px] text-zinc-500">Commands for this project only</p>
          </header>

          <div ref={scrollRef} className="max-h-72 flex-1 space-y-2 overflow-y-auto px-3 py-2">
            {messages.map((m) => (
              <div
                key={m.id}
                className={`rounded-lg px-2.5 py-1.5 text-xs leading-relaxed ${
                  m.role === "user"
                    ? "ml-6 bg-accent/20 text-zinc-100"
                    : "mr-4 bg-ink-950/80 text-zinc-300"
                }`}
              >
                {renderSimpleMarkdown(m.text)}
              </div>
            ))}
            {sending ? <p className="text-[10px] text-zinc-500">Working…</p> : null}
          </div>

          <div className="flex flex-wrap gap-1 border-t border-white/5 px-2 py-1.5">
            {chips.map((c) => (
              <button
                key={c}
                type="button"
                disabled={sending}
                onClick={() => setInput(c)}
                className="rounded-md border border-white/10 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-white/20 hover:text-zinc-200"
              >
                {c}
              </button>
            ))}
          </div>

          <form
            className="flex gap-2 border-t border-white/10 p-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type a command…"
              disabled={sending}
              maxLength={2000}
              className="min-w-0 flex-1 rounded-lg border border-white/10 bg-ink-950/60 px-2 py-1.5 text-xs text-white placeholder:text-zinc-600"
            />
            <button
              type="submit"
              disabled={sending || input.trim().length === 0}
              className="ui-btn-secondary ui-btn-sm shrink-0"
            >
              Send
            </button>
          </form>
        </div>
      ) : null}
    </>
  );
}
