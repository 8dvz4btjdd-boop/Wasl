"use client";

import { useTranslations } from "next-intl";
import type { Presence } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export const PRESENCE: Presence[] = ["available", "busy", "offline"];

const DOT: Record<Presence, string> = {
  available: "bg-teal-fg",
  busy: "bg-violet-fg",
  offline: "bg-muted-foreground/50",
};

export function PresenceDot({ value, className }: { value: Presence; className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[value], className)} />;
}

/** Segmented control; the parent applies the change optimistically. */
export function PresenceToggle({ value, onChange }: { value: Presence; onChange: (value: Presence) => void }) {
  const t = useTranslations("Presence");
  return (
    <div role="radiogroup" aria-label={t("label")} className="flex rounded-lg border bg-muted p-0.5">
      {PRESENCE.map((option, i) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={active}
            title={`${t(option)} (${i + 1})`}
            onClick={() => onChange(option)}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
            )}
          >
            <PresenceDot value={option} />
            {t(option)}
          </button>
        );
      })}
    </div>
  );
}
