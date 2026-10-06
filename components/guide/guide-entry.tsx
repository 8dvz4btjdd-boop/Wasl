"use client";

import { ArrowUp, Volume2 } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { AIBadge } from "@/components/ai/ai-badge";
import { Button } from "@/components/ui/button";
import { QUESTION_MAX } from "@/lib/chat/types";
import type { GuideSummary } from "@/lib/guide/actions";
import { useEntryGuide } from "@/lib/guide/use-guide";
import { useSpeechInput, useSpeechOutput } from "@/lib/guide/voice";
import { DURATION, EASE_OUT } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { Orb, type OrbState } from "./orb";
import { SummaryCard } from "./summary-card";
import { VoiceControls } from "./voice-controls";

type GuideEntryProps = {
  /** The asker confirmed the summary: the conversation is created from it. */
  onConfirmed: (summary: GuideSummary, aiTopic: GuideSummary["topic"], questions: number) => void;
  /** Skipped or unavailable: the plain question box, with what the asker typed. */
  onExit: (prefill: string, reason: "skipped" | "fallback") => void;
  pending: boolean;
  /** A line above the opening (a returning asker: "this continues your previous conversation"). */
  note?: string;
};

/**
 * The guide on the entry flow: "what's your question?", then at most three short questions,
 * one at a time in large type, voice or text, then the summary to confirm. The orb listens,
 * speaks and settles; with reduced motion it stays still. Skip any time.
 */
export function GuideEntry({ onConfirmed, onExit, pending, note }: GuideEntryProps) {
  const t = useTranslations("Guide");
  const locale = useLocale();
  const [text, setText] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const speech = useSpeechOutput(locale);
  const guide = useEntryGuide({ locale, refusalText: t("refused"), onQuestion: (q) => void speech.speak(q) });
  const mic = useSpeechInput(locale, (heard) => setText(heard));

  const [exited, setExited] = useState(false);
  if (!exited && (guide.phase === "skipped" || guide.phase === "fallback")) {
    setExited(true);
    // Everything the asker typed so far (their question, their answers, an unsent line) moves over.
    const typed = [...guide.lines.filter((l) => l.role === "asker").map((l) => l.text), text.trim()].filter(Boolean).join("\n");
    onExit(typed, guide.phase === "skipped" ? "skipped" : "fallback");
  }

  const typing = guide.phase === "ask" || guide.phase === "asking";
  const orb: OrbState = speech.speaking ? "speaking" : typing ? "listening" : guide.phase === "thinking" ? "thinking" : "done";
  const headline = guide.phase === "ask" ? t("opening") : guide.phase === "asking" ? guide.question : null;
  // The question on screen isn't repeated in the transcript beneath it.
  const history = (guide.phase === "asking" ? guide.lines.slice(0, -1) : guide.lines).filter((l, i) => i > 0 || guide.phase !== "ask");

  // The first tap is the gesture the browser needs: it unlocks audio for the session, and
  // every later question is spoken as it arrives. After that it replays the question.
  function listen() {
    if (!headline) return;
    speech.unlock();
    if (speech.muted) speech.toggleMute();
    void speech.speak(headline, true);
  }

  function send() {
    const value = text.trim();
    if (!value || !typing) return;
    mic.stop();
    guide.submit(value);
    setText("");
  }

  return (
    <div data-testid="guide" data-phase={guide.phase} className="flex flex-1 flex-col">
      <section aria-label={t("label")} className="flex flex-1 flex-col items-center gap-5 pt-[6vh] text-center">
        <div className="flex items-center gap-2">
          <AIBadge />
          {mic.listening && <span className="text-xs font-medium text-teal-fg">{t("listening")}</span>}
        </div>
        <Orb state={orb} size={guide.phase === "summary" ? 72 : 96} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={guide.phase === "asking" ? `q-${guide.question}` : guide.phase}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className="flex w-full max-w-xl flex-col items-center gap-3"
          >
            {headline && (
              <h1 data-testid="guide-question" dir="auto" className="text-3xl leading-snug font-semibold text-balance sm:text-4xl">
                {headline}
              </h1>
            )}
            {headline && (
              <button
                type="button"
                data-testid="guide-listen"
                onClick={listen}
                aria-pressed={speech.speaking}
                className="inline-flex h-10 items-center gap-2 rounded-full border border-border px-4 text-sm text-muted-foreground transition-colors duration-150 hover:border-input hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                <Volume2 className="size-4" aria-hidden />
                {t("listen")}
              </button>
            )}
            {guide.phase === "ask" && note && <p className="text-lg">{note}</p>}
            {guide.phase === "ask" && <p className="text-muted-foreground">{t("openingHint")}</p>}
            {guide.phase === "thinking" && <p className="text-muted-foreground">{t("thinking")}</p>}
            {guide.phase === "summary" && guide.summary && (
              <SummaryCard
                summary={guide.summary}
                language={locale}
                disabled={pending}
                onConfirm={(topic) => onConfirmed({ ...guide.summary!, topic }, guide.summary!.topic, guide.questionsAsked)}
              />
            )}
          </motion.div>
        </AnimatePresence>

        {history.length > 0 && (
          <ol aria-label={t("transcript")} className="flex w-full max-w-xl flex-col gap-1.5 text-start text-sm">
            {/* With the summary up, only the guide's "the dāʿī will answer this" lines stay. */}
            {history.filter((line) => guide.phase !== "summary" || line.refusal).map((line, i) => (
              <li key={i} dir="auto" className={cn("rounded-xl px-3 py-1.5", line.role === "asker" ? "self-end bg-brand-violet/25" : "self-start bg-muted text-muted-foreground", line.refusal && "italic")}>
                {line.text}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="sticky bottom-0 mt-auto flex flex-col gap-3 bg-background pt-6">
        <button
          type="button"
          data-testid="guide-skip"
          onClick={guide.skip}
          className="self-center text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {t("skip")}
        </button>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
          className="flex items-end gap-2"
        >
          <textarea
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
            disabled={!typing}
            autoFocus
            rows={1}
            maxLength={QUESTION_MAX}
            placeholder={guide.phase === "ask" ? t("questionPlaceholder") : t("answerPlaceholder")}
            aria-label={guide.phase === "ask" ? t("questionPlaceholder") : t("answerPlaceholder")}
            className="field-sizing-content max-h-48 min-h-14 w-full min-w-0 resize-none rounded-2xl border border-input bg-input/30 px-5 py-4 text-lg outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
          />
          <VoiceControls
            micSupported={mic.supported}
            listening={mic.listening}
            soundOn={speech.unlocked && !speech.muted}
            onMic={() => {
              speech.unlock();
              if (mic.listening) mic.stop();
              else {
                // The guide's own voice must not end up in the transcript.
                speech.stop();
                mic.start();
              }
            }}
            onSpeaker={() => {
              if (!speech.unlocked) listen();
              else speech.toggleMute();
            }}
          />
          <Button type="submit" disabled={!typing || !text.trim()} aria-label={t("send")} className="size-14 shrink-0 rounded-2xl">
            <ArrowUp className="size-6" aria-hidden />
          </Button>
        </form>
      </div>
    </div>
  );
}
