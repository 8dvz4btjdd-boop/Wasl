"use client";

import { useNow } from "./use-clock";

export function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(s).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Live "time since" in tabular figures, always left-to-right. */
export function Elapsed({ since, className }: { since: string; className?: string }) {
  const now = useNow();
  return (
    <span dir="ltr" className={className} style={{ fontVariantNumeric: "tabular-nums" }}>
      {now === null ? "–" : formatElapsed(now - Date.parse(since))}
    </span>
  );
}
