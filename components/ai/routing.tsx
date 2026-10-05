"use client";

import { Check, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { AIBadge } from "@/components/ai/ai-badge";
import { languageName } from "@/components/chat/format";
import { correctTopic } from "@/app/[locale]/(asker)/wait/actions";
import { isolate } from "@/lib/bidi";
import { TOPICS } from "@/lib/chat/types";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type MatchReasons = {
  name?: string;
  language: string;
  topic: string | null;
  language_ok: boolean;
  topic_ok: boolean;
  available: boolean;
};

const AUTO_CONFIRM_MS = 8_000;
const confirmedKey = (id: string) => `wasl.classified.${id}`;

/**
 * Right after the question: what the AI guide understood (topic · language), with "Correct"
 * and "Change". Change opens the topic chips and re-routes. Confirms itself after 8 s.
 */
export function ClassificationConfirm({ conversationId, topic, language }: { conversationId: string; topic: string; language: string }) {
  const t = useTranslations("Routing");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const [open, setOpen] = useState(() => {
    try {
      return !window.sessionStorage.getItem(confirmedKey(conversationId));
    } catch {
      return true;
    }
  });
  const [editing, setEditing] = useState(false);
  const [current, setCurrent] = useState(topic);
  const [pending, startTransition] = useTransition();

  const close = () => {
    try {
      window.sessionStorage.setItem(confirmedKey(conversationId), "1");
    } catch {
      // Storage blocked: it just shows again on reload.
    }
    setOpen(false);
  };

  useEffect(() => {
    if (!open || editing) return;
    const timer = window.setTimeout(close, AUTO_CONFIRM_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          exit="exit"
          role="status"
          data-testid="classification"
          className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-brand-violet/40 bg-card p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <AIBadge />
            <p className="text-sm">
              {t("understood", { topic: tTopic(current as never), language: languageName(language, locale) })}
            </p>
          </div>
          {editing ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-muted-foreground">{t("pickTopic")}</p>
              <div className="flex flex-wrap gap-2">
                {TOPICS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={pending}
                    aria-pressed={option === current}
                    onClick={() =>
                      startTransition(async () => {
                        if (option !== current) {
                          const res = await correctTopic(conversationId, option);
                          if (res.ok) setCurrent(option);
                        }
                        close();
                      })
                    }
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      option === current ? "border-brand-teal bg-teal-bg" : "hover:bg-muted",
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
                onClick={close}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Check className="size-4" aria-hidden />
                {t("correct")}
              </button>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex h-9 items-center rounded-lg border px-3 text-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {t("change")}
              </button>
            </div>
          )}
          {!editing && (
            <span
              aria-hidden
              className="absolute inset-x-0 bottom-0 h-0.5 bg-brand-violet/60 motion-reduce:hidden"
              style={{ animation: `wasl-countdown ${AUTO_CONFIRM_MS}ms linear forwards` }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Mark({ ok }: { ok: boolean }) {
  return ok ? <Check className="inline size-3.5 text-teal-fg" aria-label="✓" /> : <X className="inline size-3.5 text-warning-fg" aria-label="✗" />;
}

/** "Khalid: Arabic ✓ · Qur'an ✓ · Available now", partial with ✗, or nobody free yet. */
export function MatchLine({ quality, reasons }: { quality: "full" | "partial" | "none"; reasons: MatchReasons }) {
  const t = useTranslations("Routing");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const language = languageName(reasons.language, locale);
  if (quality === "none") {
    return <p data-testid="match" className="text-center text-sm text-muted-foreground">{t("matchNone", { language })}</p>;
  }
  return (
    <p data-testid="match" className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
      {quality === "partial" ? <span className="font-medium text-warning-fg">{t("partial")}:</span> : reasons.name && <span className="font-medium text-foreground">{isolate(reasons.name)}:</span>}
      <span>
        {language} <Mark ok={reasons.language_ok} />
      </span>
      {reasons.topic && (
        <>
          <span aria-hidden>·</span>
          <span>
            {tTopic(reasons.topic as never)} <Mark ok={reasons.topic_ok} />
          </span>
        </>
      )}
      {quality === "full" && (
        <>
          <span aria-hidden>·</span>
          <span>{t("availableNow")}</span>
        </>
      )}
    </p>
  );
}

/** Daee header strip before the first reply: how the question was classified, and by whom. */
export function IntakeStrip({ topic, depth, by }: { topic: string | null; depth: string | null; by: "ai" | "chip" | null }) {
  const t = useTranslations("Routing");
  const tTopic = useTranslations("Topics");
  if (!topic) return null;
  return (
    <p data-testid="intake-strip" className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      {by === "ai" ? (
        <>
          <AIBadge />
          <span>
            {t("stripAI", { topic: tTopic(topic as never) })}
            {depth && ` · ${t("stripDepth", { depth: t(`depth_${depth}` as never) })}`}
          </span>
        </>
      ) : (
        <span>{t("stripChip", { topic: tTopic(topic as never) })}</span>
      )}
    </p>
  );
}
