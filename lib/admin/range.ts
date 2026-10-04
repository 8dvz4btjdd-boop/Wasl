import { startOfOrgDay } from "@/lib/chat/inbox-query";

export const RANGES = ["today", "7d", "all"] as const;
export type Range = (typeof RANGES)[number];

export function parseRange(value: unknown): Range {
  return RANGES.includes(value as Range) ? (value as Range) : "7d";
}

/** Instants for a range (docs/kpis.md): Today from org midnight, 7 days rolling, Since launch from the epoch. */
export function rangeBounds(range: Range, now = new Date()): { from: string; to: string } {
  const to = new Date(now.getTime() + 1000).toISOString();
  if (range === "today") return { from: startOfOrgDay(now), to };
  if (range === "7d") return { from: new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString(), to };
  return { from: new Date(0).toISOString(), to };
}

/** The minimum sample before a rate is shown (docs/kpis.md). */
export const MIN_SAMPLE = 5;
