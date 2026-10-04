"use client";

import { useSyncExternalStore } from "react";

// One shared 1-second ticker for every timer on the page.
let now = Date.now();
const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (!interval) {
    now = Date.now();
    interval = setInterval(() => {
      now = Date.now();
      listeners.forEach((l) => l());
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = undefined;
    }
  };
}

/** Current time, ticking each second. Null during server render, so times never mismatch on hydration. */
export function useNow(): number | null {
  return useSyncExternalStore(subscribe, () => now, () => null);
}

const noopSubscribe = () => () => {};

/** True once running in the browser. */
export function useHydrated(): boolean {
  return useSyncExternalStore(noopSubscribe, () => true, () => false);
}
