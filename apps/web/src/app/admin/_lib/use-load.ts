"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { AdminApiError } from "./client";

export function messageOf(e: unknown): string {
  return e instanceof AdminApiError ? e.message : "Something went wrong. Try again.";
}

/** Loads on mount and whenever `key` changes; `reload()` forces a refresh. A stale response from an older key is dropped. */
export function useLoad<T>(load: () => Promise<T>, key: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadRef
      .current()
      .then(v => {
        if (cancelled) return;
        setData(v);
        setError(null);
      })
      .catch(e => {
        if (!cancelled) setError(messageOf(e));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [key, tick]);
  const reload = useCallback(() => setTick(t => t + 1), []);
  return { data, error, loading, reload, setError };
}

/** Runs one write at a time: busy flag, the fixed-sentence error for a failure, and a callback on success. */
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(async (fn: () => Promise<void>): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      return true;
    } catch (e) {
      setError(messageOf(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);
  return { busy, error, setError, run };
}
