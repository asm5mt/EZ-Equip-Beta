import { createContext, useCallback, useContext, useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";

export interface DiagnosticEntry {
  id: string;
  name: string;
  context?: Record<string, unknown>;
}

interface DiagnosticsStackContextValue {
  stack: DiagnosticEntry[];
  register: (entry: DiagnosticEntry) => void;
  unregister: (id: string) => void;
}

const DiagnosticsStackContext = createContext<DiagnosticsStackContextValue | null>(null);

export function DiagnosticsProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<DiagnosticEntry[]>([]);

  // Stable across renders (empty dep array) so consumers' effects — which
  // depend on these functions, not on `stack` — don't refire every time the
  // stack changes elsewhere in the tree. Without this, registering/
  // unregistering anywhere would re-trigger every other registration's
  // effect, which re-registers, which changes the stack again: infinite loop.
  const register = useCallback((entry: DiagnosticEntry) => {
    setStack(prev => {
      const idx = prev.findIndex(e => e.id === entry.id);
      if (idx === -1) return [...prev, entry];
      const next = [...prev];
      next[idx] = entry;
      return next;
    });
  }, []);

  const unregister = useCallback((id: string) => {
    setStack(prev => prev.filter(e => e.id !== id));
  }, []);

  const value = useMemo<DiagnosticsStackContextValue>(() => ({
    stack,
    register,
    unregister,
  }), [stack, register, unregister]);

  return <DiagnosticsStackContext.Provider value={value}>{children}</DiagnosticsStackContext.Provider>;
}

/** Read-only view of the current modal registration stack, for the overlay panel itself. */
export function useDiagnosticsStack(): DiagnosticEntry[] {
  const ctx = useContext(DiagnosticsStackContext);
  if (!ctx) throw new Error("useDiagnosticsStack must be used inside DiagnosticsProvider");
  return ctx.stack;
}

/**
 * Self-registration hook for modals: announces name + context on mount,
 * updates on re-render, and unregisters automatically on unmount. Nesting
 * (e.g. a delete confirmation inside an edit modal) just means multiple
 * components call this concurrently — each gets its own stack entry.
 */
export function useDiagnosticRegistration(name: string, context?: Record<string, unknown>) {
  const ctx = useContext(DiagnosticsStackContext);
  const register = ctx?.register;
  const unregister = ctx?.unregister;
  const id = useId();
  const contextKey = context ? JSON.stringify(context) : undefined;

  useEffect(() => {
    if (!register || !unregister) return;
    register({ id, name, context });
    return () => unregister(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [register, unregister, id, name, contextKey]);
}

/**
 * Render-conditional wrapper around useDiagnosticRegistration, for modals
 * whose content stays declared in JSX regardless of open state (e.g. a
 * Radix Dialog). Mount it only while the modal is actually open:
 * `{open && <DiagnosticsRegistration name="Add Role" context={{ hasChanges }} />}`.
 */
export function DiagnosticsRegistration({ name, context }: { name: string; context?: Record<string, unknown> }) {
  useDiagnosticRegistration(name, context);
  return null;
}
