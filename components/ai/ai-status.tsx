"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { AIMetaClient, AIState } from "@/lib/ai/useAITask";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";

/** The orb: teal into violet, a slow breath while working, still otherwise. */
function Orb({ active, muted }: { active: boolean; muted: boolean }) {
  return (
    <span aria-hidden className="relative grid size-7 shrink-0 place-items-center">
      {active && (
        <span className="absolute inset-0 animate-ping rounded-full bg-brand-teal/30 [animation-duration:1.6s] motion-reduce:hidden" />
      )}
      <span
        className={cn(
          "relative size-5 rounded-full transition-colors duration-200",
          muted ? "bg-muted-foreground/40" : "bg-[linear-gradient(135deg,var(--color-brand-gradient-from),var(--color-brand-violet))]",
        )}
      />
    </span>
  );
}

/**
 * The one status visual for every AI feature: thinking (orb + step labels), streaming,
 * done (a chip with the model tier and latency), fallback (gray, "manual path").
 */
export function AIStatus({ state, steps, meta, className }: { state: AIState; steps: string[]; meta: AIMetaClient | null; className?: string }) {
  const t = useTranslations("AI");
  const locale = useLocale();
  const [stepIndex, setStepIndex] = useState(0);

  // A new run starts again at the first step (adjusted during render, not in an effect).
  const [seen, setSeen] = useState(state);
  if (seen !== state) {
    setSeen(state);
    if (state === "thinking") setStepIndex(0);
  }

  useEffect(() => {
    if (state !== "thinking") return;
    const timer = window.setInterval(() => setStepIndex((i) => Math.min(i + 1, steps.length - 1)), 1400);
    return () => window.clearInterval(timer);
  }, [state, steps.length]);

  if (state === "idle") return null;
  const label =
    state === "thinking" ? steps[stepIndex] : state === "streaming" ? t("streaming") : state === "done" ? t("done") : t("fallback");
  const seconds = meta ? new Intl.NumberFormat(locale, { style: "unit", unit: "second", maximumFractionDigits: 1 }).format(meta.latencyMs / 1000) : null;

  return (
    <div role="status" aria-live="polite" className={cn("flex items-center gap-2.5 text-sm", state === "fallback" ? "text-muted-foreground" : "text-foreground", className)}>
      <Orb active={state === "thinking" || state === "streaming"} muted={state === "fallback"} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={label}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: DURATION.fast, ease: EASE_OUT }}
        >
          {label}
        </motion.span>
      </AnimatePresence>
      {state === "done" && meta && (
        <span className="rounded-full bg-muted px-2 text-[11px] leading-5 text-muted-foreground tabular-nums">
          {meta.tier === "card" ? t("tierCard") : t("tierFast")} · {seconds}
        </span>
      )}
    </div>
  );
}
