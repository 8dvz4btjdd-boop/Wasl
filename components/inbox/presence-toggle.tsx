"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Presence } from "@/lib/chat/types";
import { cn } from "@/lib/utils";

export const PRESENCE: Presence[] = ["available", "busy", "offline"];

const DOT: Record<Presence, string> = {
  available: "bg-teal-fg",
  busy: "bg-warning-fg",
  offline: "bg-muted-foreground/50",
};

export function PresenceDot({ value, className }: { value: Presence; className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", DOT[value], className)} />;
}

/** Compact chip with a dropdown. 1/2/3 also switch presence (see the inbox shortcuts). */
export function PresenceMenu({ value, onChange }: { value: Presence; onChange: (value: Presence) => void }) {
  const t = useTranslations("Presence");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("label")}: ${t(value)}`}
        className="flex h-7 items-center gap-1.5 rounded-full border bg-card ps-2.5 pe-2 text-xs font-medium transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <PresenceDot value={value} />
        {t(value)}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("label")}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value} onValueChange={(next) => onChange(next as Presence)}>
            {PRESENCE.map((option, i) => (
              <DropdownMenuRadioItem key={option} value={option}>
                <PresenceDot value={option} />
                {t(option)}
                <kbd className="ms-auto text-[10px] text-muted-foreground">{i + 1}</kbd>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
