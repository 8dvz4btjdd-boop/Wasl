"use client";

import { useCallback, useSyncExternalStore } from "react";

const EVENT = "wasl:stored-flag";
// Used when storage is blocked (private windows), so the toggle still works for the session.
const memory = new Map<string, string>();

function read(key: string): string | null {
  try {
    return localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(EVENT, onChange);
  };
}

/**
 * A per-viewer boolean preference in localStorage (e.g. a panel left open). The server and
 * first client render use the default, so hydration always matches; storage can be missing.
 */
export function useStoredFlag(key: string, defaultValue: boolean): [boolean, (value: boolean) => void] {
  const stored = useSyncExternalStore(subscribe, () => read(key), () => null);
  const value = stored === null ? defaultValue : stored === "1";
  const set = useCallback(
    (next: boolean) => {
      memory.set(key, next ? "1" : "0");
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {}
      window.dispatchEvent(new Event(EVENT));
    },
    [key],
  );
  return [value, set];
}
