"use client";

import { Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/** The persistent "AI guide" label on anything the model wrote (fixed limit 8). */
export function AIBadge({ className }: { className?: string }) {
  const t = useTranslations("AI");
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-brand-violet/40 bg-brand-violet/10 px-2 text-[11px] leading-5 font-medium text-violet-fg",
        className,
      )}
    >
      <Sparkles className="size-3" aria-hidden />
      {t("badge")}
    </span>
  );
}
