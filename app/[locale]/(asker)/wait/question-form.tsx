"use client";

import { ArrowUp } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useRef, useState } from "react";
import { useHydrated } from "@/components/chat/use-clock";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/auth/forms";
import { QUESTION_MAX, TOPICS, type Topic } from "@/lib/chat/types";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { startConversation } from "./actions";

export function QuestionForm() {
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

  return (
    <div className="flex flex-1 flex-col">
      <motion.div variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-3 pt-[12vh]">
        <h1 className="max-w-[18ch] text-4xl leading-tight font-semibold text-balance sm:text-5xl">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("hint")}</p>
      </motion.div>

      <form ref={form} action={formAction} className="sticky bottom-0 mt-auto flex flex-col gap-4 bg-background pt-6">
        <input type="hidden" name="locale" value={locale} />
        <input type="hidden" name="topic" value={topic ?? ""} />

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
