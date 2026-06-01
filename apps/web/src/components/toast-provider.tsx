"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ToastVariant = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  variant: ToastVariant;
};

type ToastOptions = {
  message: string;
  variant?: ToastVariant;
  durationMs?: number;
};

type ToastContextValue = {
  toast: (options: ToastOptions) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION_MS: Record<ToastVariant, number> = {
  success: 4500,
  error: 7000,
  info: 5000,
};

let toastCounter = 0;

function nextToastId(): string {
  toastCounter += 1;
  return `toast-${toastCounter}`;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    ({ message, variant = "info", durationMs }: ToastOptions) => {
      const trimmed = message.trim();
      if (trimmed.length === 0) {
        return;
      }
      const id = nextToastId();
      const item: ToastItem = { id, message: trimmed, variant };
      setToasts((prev) => [...prev.slice(-4), item]);

      const duration = durationMs ?? DEFAULT_DURATION_MS[variant];
      const timer = setTimeout(() => dismiss(id), duration);
      timersRef.current.set(id, timer);
    },
    [dismiss],
  );

  const value = useMemo<ToastContextValue>(
    () => ({
      toast,
      success: (message) => toast({ message, variant: "success" }),
      error: (message) => toast({ message, variant: "error" }),
      info: (message) => toast({ message, variant: "info" }),
      dismiss,
    }),
    [toast, dismiss],
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 px-4 sm:bottom-6 sm:right-6 sm:px-0"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (ctx === null) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const accent: Record<ToastVariant, string> = {
    success: "border-l-green-500",
    error:   "border-l-rose-500",
    info:    "border-l-blue-500",
  };

  const iconBg: Record<ToastVariant, string> = {
    success: "bg-green-100 text-green-700",
    error:   "bg-rose-100 text-rose-600",
    info:    "bg-blue-100 text-blue-600",
  };

  return (
    <div
      role="alert"
      className={`pointer-events-auto flex w-full items-center gap-3 rounded-xl border border-l-4 border-slate-200 bg-white px-4 py-3 shadow-lg shadow-slate-200/80 animate-slide-up ${accent[item.variant]}`}
    >
      {/* Icon */}
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${iconBg[item.variant]}`}>
        {item.variant === "success" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
        {item.variant === "error" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        )}
        {item.variant === "info" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        )}
      </span>

      {/* Message */}
      <p className="min-w-0 flex-1 text-sm font-medium leading-snug text-slate-800">{item.message}</p>

      {/* Dismiss */}
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded-lg p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
        aria-label="Dismiss notification"
      >
        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
