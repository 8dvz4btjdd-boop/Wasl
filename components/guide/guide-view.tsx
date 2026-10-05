"use client";

import { Check } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AIBadge } from "@/components/ai/ai-badge";
import { Readings } from "@/components/ai/readings";
import { languageName } from "@/components/chat/format";
import { TOPICS } from "@/lib/chat/types";
import type { GuideSummary } from "@/lib/guide/actions";
import type { GuideLine, GuidePhase } from "@/lib/guide/use-guide";
import { DURATION, EASE_OUT, fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Orb, type OrbState } from "./orb";

const AUTO_CONFIRM_MS = 8_000;

type GuideViewProps = {
  conversationId: string;
  phase: GuidePhase;
  lines: GuideLine[];
  question: string | null;
  summary: GuideSummary | null;
  speaking: boolean;
  listening: boolean;
  position: number | null;
  /** The asker's language, for "… · Arabic". */
  language: string;
  onSkip: () => void;
  onConfirm: (topic: GuideSummary["topic"]) => void;
};

/**
 * The waiting screen as the guide's surface: the orb, one question at a time in large type,
 * the short transcript beneath, then the summary to confirm, then readings while the asker
 * waits. The composer below the chat stays the way to answer.
 */
export function GuideView({ conversationId, phase, lines, question, summary, speaking, listening, position, language, onSkip, onConfirm }: GuideViewProps) {
  const t = useTranslations("Guide");
  const tChat = useTranslations("Chat");
  const orb: OrbState = speaking ? "speaking" : phase === "asking" ? "listening" : phase === "starting" || phase === "thinking" ? "thinking" : "done";
  const active = phase === "starting" || phase === "asking" || phase === "thinking" || phase === "summary";
  const ended = phase === "confirmed" || phase === "skipped" || phase === "fallback";
  // The question on screen isn't repeated in the transcript beneath it.
  const history = phase === "asking" ? lines.slice(0, -1) : lines;

  return (
    <section data-testid="guide" data-phase={phase} aria-label={t("label")} className="flex flex-col items-center gap-5 py-6 text-center">
      <div className="flex items-center gap-2">
        <AIBadge />
        {listening && <span className="text-xs font-medium text-teal-fg">{t("listening")}</span>}
      </div>
      <Orb state={orb} size={phase === "asking" || phase === "starting" || phase === "thinking" ? 96 : 72} />

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={phase === "asking" ? `q-${question}` : phase}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: DURATION.base, ease: EASE_OUT }}
          className="flex w-full max-w-xl flex-col items-center gap-3"
        >
          {(phase === "starting" || phase === "thinking") && <p className="text-muted-foreground">{phase === "starting" ? t("reading") : t("thinking")}</p>}
          {phase === "asking" && question && (
            <p data-testid="guide-question" dir="auto" className="text-2xl leading-snug font-semibold text-balance sm:text-3xl">
              {question}
            </p>
          )}
          {phase === "summary" && summary && <SummaryCard summary={summary} language={language} onConfirm={onConfirm} />}
          {phase === "confirmed" && summary && (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t("confirmedTitle")}</p>
              <p dir="auto" className="text-lg font-medium">
                “{summary.question}”
              </p>
            </div>
          )}
          {ended && <p className="text-sm text-muted-foreground">{position !== null ? tChat("position", { position }) : tChat("keepWriting")}</p>}
        </motion.div>
      </AnimatePresence>

      {history.length > 0 && active && (
        <ol aria-label={t("transcript")} className="flex w-full max-w-xl flex-col gap-1.5 text-start text-sm">
          {history.map((line, i) => (
            <li key={i} dir="auto" className={cn("rounded-xl px-3 py-1.5", line.role === "asker" ? "self-end bg-brand-violet/25" : "self-start bg-muted text-muted-foreground", line.refusal && "italic")}>
              {line.text}
            </li>
          ))}
        </ol>
      )}

      {(phase === "asking" || phase === "starting" || phase === "thinking") && (
        <button
          type="button"
          onClick={onSkip}
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {t("skip")}
        </button>
      )}

      {/* Readings come from the confirmed summary (question, topic, level), never the first message. */}
      {phase === "confirmed" && summary && summary.level !== "d" && <Readings key={`r-${summary.question}`} conversationId={conversationId} className="w-full max-w-xl text-start" />}
      {(phase === "skipped" || phase === "fallback") && <Readings conversationId={conversationId} className="w-full max-w-xl text-start" />}
    </section>
  );
}

/**
 * The confirmation card, merged with the guide: what the guide understood (the summary, the
 * topic and the language), with "correct" and "change". Confirms itself after 8 seconds.
 */
function SummaryCard({ summary, language, onConfirm }: { summary: GuideSummary; language: string; onConfirm: (topic: GuideSummary["topic"]) => void }) {
  const t = useTranslations("Routing");
  const tGuide = useTranslations("Guide");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (editing) return;
    const timer = window.setTimeout(() => onConfirm(summary.topic), AUTO_CONFIRM_MS);
    return () => window.clearTimeout(timer);
  }, [editing, onConfirm, summary.topic]);

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
