"use client";

import { useSyncExternalStore } from "react";

/** Live CSS media query match. The server (and hydration) assume `serverDefault`. */
export function useMediaQuery(query: string, serverDefault = true): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => serverDefault,
  );
}
