"use client";

import { isolate } from "@/lib/bidi";
import { ArrowUp, UserRound, Users } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef, useState, useTransition } from "react";
import { GuideEntry } from "@/components/guide/guide-entry";
import { useHydrated } from "@/components/chat/use-clock";
import { PresenceDot } from "@/components/inbox/presence-toggle";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/forms";
import { isUndefinedField } from "@/lib/cards/types";
import type { Presence } from "@/lib/chat/types";
import { QUESTION_MAX, TOPICS, type Topic } from "@/lib/chat/types";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { startConversation } from "./actions";

export type ResumeInfo = {
  card: { follow_up: string | null; next_step: string | null; accept_substitute: boolean } | null;
  preferred: { name: string; status: Presence; nextSlot: string | null } | null;
};

type Choice = "same" | "substitute";

/** First question, or a returning asker's follow-up (with a choice of who continues). */
export function QuestionForm({ resume, aiEnabled }: { resume: ResumeInfo | null; aiEnabled: boolean }) {
  const t = useTranslations("Wait");
  const tTopic = useTranslations("Topics");
  const tError = useTranslations("Errors");
  const locale = useLocale();
  const hydrated = useHydrated();
  const [state, formAction, pending] = useActionState<FormState, FormData>(startConversation, {});
  const [question, setQuestion] = useState("");
  const [topic, setTopic] = useState<Topic | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const errorText = state.error ? tError(state.error) : null;
  const canSend = hydrated && !pending && question.trim().length > 0;
  // With a card, the asker first chooses who continues; without one, nothing to choose.
  const [choice, setChoice] = useState<Choice | null>(null);
  const choosing = Boolean(resume?.card) && choice === null;
  // With AI on, the guide comes first; skipping it (or it being unavailable) opens this box.
  const [guideOpen, setGuideOpen] = useState(aiEnabled);
  const [guideNote, setGuideNote] = useState(false);
  const [, startGuideSubmit] = useTransition();

  if (choosing && resume?.card) {
    return <ResumeChoice resume={resume} onChoose={setChoice} />;
  }

  if (guideOpen) {
    return (
      <GuideEntry
        pending={pending}
        note={resume ? t("followupNote") : undefined}
        onExit={(prefill, reason) => {
          setQuestion(prefill);
          setGuideNote(reason === "fallback");
          setGuideOpen(false);
        }}
        onConfirmed={(summary, aiTopic, questions) => {
          // The conversation starts from the confirmed summary, classified on the summary.
          const data = new FormData();
          data.set("locale", locale);
          data.set("question", summary.question);
          data.set("topic", summary.topic);
          data.set("ai_topic", aiTopic);
          data.set("depth", summary.depth);
          data.set("level", summary.level);
          data.set("guide", "1");
          data.set("guide_questions", String(questions));
          data.set("resume", choice ?? "");
          startGuideSubmit(() => formAction(data));
        }}
      />
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-3 pt-[12vh]">
        <h1 className="max-w-[18ch] text-4xl leading-tight font-semibold text-balance sm:text-5xl">
          {resume ? t("followTitle") : t("title")}
        </h1>
        <p className="text-lg text-muted-foreground">{resume ? t("followupNote") : t("hint")}</p>
        {/* The guide failed, ran out of time, or AI is off: the question still reaches a dāʿī. */}
        {(guideNote || !aiEnabled) && <p data-testid="guide-unavailable" className="text-base">{t("guideUnavailable")}</p>}
        {choice && (
          <p className="flex items-center gap-2 text-sm text-teal-fg">
            {choice === "same" && resume?.preferred ? t("chosenSame", { name: isolate(resume.preferred.name) }) : t("chosenSubstitute")}
            <button type="button" onClick={() => setChoice(null)} className="rounded text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
              {t("change")}
            </button>
          </p>
        )}
      </motion.div>

      <form ref={form} action={formAction} className="sticky bottom-0 mt-auto flex flex-col gap-4 bg-background pt-6">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="topic" value={topic ?? ""} />
        <input type="hidden" name="resume" value={choice ?? ""} />

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm text-muted-foreground">{t("topicLabel")}</legend>
          <div className="flex flex-wrap gap-2">
            {TOPICS.map((value) => {
              const selected = topic === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTopic(selected ? null : value)}
                  className={cn(
                    "h-9 rounded-full border px-4 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    selected
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:border-input hover:text-foreground",
                  )}
                >
                  {tTopic(value)}
                </button>
              );
            })}
          </div>
        </fieldset>

        {errorText && (
          <p id="question-error" role="alert" className="text-base text-destructive">
            {errorText}
          </p>
        )}

        <div className="flex items-end gap-3">
          <textarea
            name="question"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                if (canSend) form.current?.requestSubmit();
              }
            }}
            autoFocus
            rows={1}
            maxLength={QUESTION_MAX}
            placeholder={t("placeholder")}
            aria-label={t("placeholder")}
            aria-invalid={Boolean(errorText)}
            aria-describedby={errorText ? "question-error" : undefined}
            className="field-sizing-content max-h-56 min-h-14 w-full min-w-0 resize-none rounded-2xl border border-input bg-input/30 px-5 py-4 text-lg outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
          <Button
            type="submit"
            disabled={!canSend}
            aria-label={pending ? t("sending") : t("send")}
            className="size-14 shrink-0 rounded-2xl"
          >
            <ArrowUp className="size-6" aria-hidden />
          </Button>
        </div>
      </form>
    </div>
  );
}

function ResumeChoice({ resume, onChoose }: { resume: ResumeInfo; onChoose: (choice: Choice) => void }) {
  const t = useTranslations("Wait");
  const tCard = useTranslations("Card");
  const locale = useLocale();
  const hydrated = useHydrated();
  const card = resume.card!;
  const preferred = resume.preferred;
  const availability = !preferred
    ? null
    : preferred.status === "available"
      ? t("availableNow")
      : preferred.nextSlot && hydrated
        ? t("nextSlot", {
            time: new Intl.DateTimeFormat(locale, { weekday: "long", hour: "numeric", minute: "2-digit" }).format(new Date(preferred.nextSlot)),
          })
        : t("away");

  return (
    <div className="flex flex-1 flex-col gap-8 pt-[10vh]">
      <motion.h1 variants={fadeUp} initial="hidden" animate="visible" className="text-4xl leading-tight font-semibold text-balance sm:text-5xl">
        {t("resumeTitle")}
      </motion.h1>

      <section aria-label={t("resumeCard")} className="flex flex-col gap-3 rounded-2xl border bg-card p-5">
        <p className="text-sm font-medium text-muted-foreground">{t("resumeCard")}</p>
        {(["follow_up", "next_step"] as const).map((field) =>
          isUndefinedField(card[field]) ? null : (
            <div key={field} className="flex flex-col gap-0.5">
              <span className="text-xs text-muted-foreground">{tCard(field)}</span>
              <span dir="auto">{card[field]}</span>
            </div>
          ),
        )}
      </section>

      <div className="mt-auto flex flex-col gap-3 pb-2">
        {preferred && (
          <button
            type="button"
            onClick={() => onChoose("same")}
            className="flex items-center gap-4 rounded-2xl border bg-card p-4 text-start transition-colors hover:border-brand-teal/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-teal-bg text-teal-fg">
              <UserRound className="size-5" aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold">{t("resumeSame", { name: isolate(preferred.name) })}</span>
              <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <PresenceDot value={preferred.status} />
                {availability}
              </span>
            </span>
          </button>
        )}
        {(card.accept_substitute || !preferred) && (
          <button
            type="button"
            onClick={() => onChoose("substitute")}
            className="flex items-center gap-4 rounded-2xl border p-4 text-start transition-colors hover:bg-muted/60 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <Users className="size-5" aria-hidden />
            </span>
            <span className="flex flex-col gap-0.5">
              <span className="text-lg font-semibold">{t("resumeSubstitute")}</span>
              <span className="text-sm text-muted-foreground">{t("substituteHint")}</span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
