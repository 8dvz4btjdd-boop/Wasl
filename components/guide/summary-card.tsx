"use client";

import { Check } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { languageName } from "@/components/chat/format";
import { TOPICS } from "@/lib/chat/types";
import type { GuideSummary } from "@/lib/guide/actions";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

const AUTO_CONFIRM_MS = 8_000;

/**
 * The confirmation card, merged with the guide: what the guide understood (the summary, the
 * topic and the language), with "correct" and "change". Confirms itself after 8 seconds.
 */
export function SummaryCard({ summary, language, onConfirm, disabled = false }: { summary: GuideSummary; language: string; onConfirm: (topic: GuideSummary["topic"]) => void; disabled?: boolean }) {
  const t = useTranslations("Routing");
  const tGuide = useTranslations("Guide");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (editing || disabled) return;
    const timer = window.setTimeout(() => onConfirm(summary.topic), AUTO_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [editing, disabled, onConfirm, summary.topic]);

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible" data-testid="classification" className="relative flex w-full flex-col gap-3 overflow-hidden rounded-2xl border border-brand-violet/40 bg-card p-4 text-start">
      <p className="text-sm text-muted-foreground">{tGuide("summaryLead")}</p>
      <p dir="auto" className="text-lg leading-snug font-medium">
        “{summary.question}”
      </p>
      <p className="flex flex-wrap gap-1.5 text-xs">
        <span className="rounded-full bg-teal-bg px-2.5 leading-6 text-teal-fg">{tTopic(summary.topic)}</span>
        <span className="rounded-full bg-muted px-2.5 leading-6 text-muted-foreground">{languageName(language, locale)}</span>
      </p>
      {summary.level === "d" && <p className="text-xs text-warning-fg">{tGuide("specialistNote")}</p>}
      {editing ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t("pickTopic")}</p>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((option) => (
              <button
                key={option}
                type="button"
                aria-pressed={option === summary.topic}
                onClick={() => onConfirm(option)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                  option === summary.topic ? "border-brand-teal bg-teal-bg" : "hover:bg-muted",
                )}
              >
                {tTopic(option)}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(summary.topic)}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <Check className="size-4" aria-hidden />
            {t("correct")}
          </button>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex h-10 items-center rounded-lg border px-4 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {t("change")}
          </button>
        </div>
      )}
      {!editing && (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-violet/60 motion-reduce:hidden" style={{ animation: `wasl-countdown ${AUTO_CONFIRM_MS}ms linear forwards` }} />
      )}
    </motion.div>
  );
}
