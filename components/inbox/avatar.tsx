import { initialOf } from "@/components/chat/format";
import type { Presence } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

// Quiet tints with dark text (AA in light, inverted in dark); picked from the name so a
// person keeps the same colour everywhere.
const TINTS = [
  "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-200",
  "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
  "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-200",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
];

function tintFor(name: string) {
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.codePointAt(0)!) | 0;
  return TINTS[Math.abs(hash) % TINTS.length];
}

export const PRESENCE_RING: Record<Presence, string> = {
  available: "ring-teal-fg",
  busy: "ring-warning-fg",
  offline: "ring-muted-foreground/40",
};

type AvatarProps = {
  name: string;
  size?: "sm" | "md";
  /** Shows a presence ring around the initial. */
  presence?: Presence;
  className?: string;
};

export function Avatar({ name, size = "md", presence, className }: AvatarProps) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid shrink-0 place-items-center rounded-full font-semibold select-none",
        size === "sm" ? "size-8 text-xs" : "size-9 text-sm",
        tintFor(name),
        presence && ["ring-2 ring-offset-2 ring-offset-background", PRESENCE_RING[presence]],
        className,
      )}
    >
      {initialOf(name)}
    </span>
  );
}
