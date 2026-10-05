"use client";

import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { rateFollowup } from "@/lib/inbox/actions";
import type { ConversationSummary } from "@/lib/chat/types";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Answer = boolean | null;

/**
 * Ending a follow-up (any mode): two one-tap questions before closing, every time. "Was the
 * context enough to go on without starting over?" and, only when the follow-up had a card,
 * "Was the card accurate?". Skippable: ending without answers logs nothing.
 */
export function EndFollowupPanel({
  conversation: c,
  ending,
  onEnd,
  onCancel,
  onRated,
}: {
  conversation: ConversationSummary;
  ending: boolean;
  onEnd: () => Promise<void>;
  onCancel: () => void;
  onRated: (sufficient: Answer) => void;
}) {
  const t = useTranslations("Inbox");
  const [sufficient, setSufficient] = useState<Answer>(null);
  const [accurate, setAccurate] = useState<Answer>(null);
  const [saving, setSaving] = useState(false);
  const first = useRef<HTMLButtonElement>(null);
  const hasCard = Boolean(c.card_id);
  const answered = sufficient !== null || (hasCard && accurate !== null);

  useEffect(() => first.current?.focus(), []);

  async function finish(withAnswers: boolean) {
    setSaving(true);
    if (withAnswers && answered) {
      const { ok } = await rateFollowup({ conversationId: c.id, sufficient, cardAccurate: hasCard ? accurate : null });
      if (ok) onRated(sufficient);
    }
    await onEnd();
    setSaving(false);
  }

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      role="dialog"
      aria-labelledby="end-followup-title"
      className="border-b bg-teal-bg/60 px-4 py-4 md:px-6"
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-4">
        <h2 id="end-followup-title" className="text-sm font-semibold">
          {t("endFollowupTitle")}
        </h2>
        <Question label={t("rateContext")} value={sufficient} onChange={setSufficient} firstRef={first} />
        {hasCard && <Question label={t("rateCard")} value={accurate} onChange={setAccurate} />}
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="destructive" disabled={!answered || saving || ending} onClick={() => finish(true)}>
            {t("saveAndEnd")}
          </Button>
          <Button size="sm" variant="outline" disabled={saving || ending} onClick={() => finish(false)}>
            {t("skipAndEnd")}
          </Button>
          <Button size="sm" variant="ghost" disabled={saving || ending} onClick={onCancel}>
            {t("cancel")}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}

function Question({
  label,
  value,
  onChange,
  firstRef,
}: {
  label: string;
  value: Answer;
  onChange: (value: Answer) => void;
  firstRef?: React.Ref<HTMLButtonElement>;
}) {
  const t = useTranslations("Inbox");
  return (
    <fieldset className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <legend className="sr-only">{label}</legend>
      <p aria-hidden className="text-sm">
        {label}
      </p>
      <div role="radiogroup" aria-label={label} className="flex rounded-lg border bg-card p-0.5">
        {([true, false] as const).map((option, i) => (
          <button
            key={String(option)}
            ref={i === 0 ? firstRef : undefined}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(value === option ? null : option)}
            className={cn(
              "h-7 min-w-14 rounded-md px-3 text-xs font-medium transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
              value === option ? "bg-brand-violet text-white" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option ? t("yes") : t("no")}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
