"use client";

import { useCallback, useRef, useState } from "react";
import { guideSkipped, guideStep, type GuideStep, type GuideSummary } from "./actions";

export type GuidePhase = "ask" | "asking" | "thinking" | "summary" | "fallback" | "skipped";
export type GuideLine = { role: "asker" | "guide"; text: string; refusal?: boolean };

/** The whole step, retry included, gets this long; then the plain question box (entry never blocks). */
const STEP_BUDGET_MS = 10_000;

/** A server step that can't hang the screen: it resolves to a fallback once `ms` have passed. */
async function stepWithin(input: Parameters<typeof guideStep>[0], ms: number): Promise<GuideStep> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    guideStep(input).catch(() => ({ kind: "fallback", reason: "rejected" }) as GuideStep),
    new Promise<GuideStep>((resolve) => {
      timer = setTimeout(() => resolve({ kind: "fallback", reason: "client_timeout" }), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * The guide on the entry flow, before the conversation exists: the asker's question, then at
 * most three short questions, then a summary to confirm. A step has 10 seconds in all: a
 * rejected request or a server exception is retried once inside that budget; any other
 * failure, or the budget running out, ends the guide calmly and the asker gets the plain
 * question box with what they typed. Nothing can leave it stuck on "one moment".
 */
export function useEntryGuide({ locale, refusalText, onQuestion }: { locale: string; refusalText: string; onQuestion?: (q: string) => void }) {
  const [phase, setPhase] = useState<GuidePhase>("ask");
  const [lines, setLines] = useState<GuideLine[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [summary, setSummary] = useState<GuideSummary | null>(null);
  const [firstMessage, setFirstMessage] = useState("");
  const ended = useRef(false);
  const questionsAsked = lines.filter((l) => l.role === "guide" && !l.refusal).length;

  const step = useCallback(
    async (first: string, next: GuideLine[]) => {
      setPhase("thinking");
      const input = { firstMessage: first, locale, turns: next.filter((l) => !l.refusal).map(({ role, text }) => ({ role, text })) };
      const deadline = Date.now() + STEP_BUDGET_MS;
      let res = await stepWithin(input, STEP_BUDGET_MS);
      const left = deadline - Date.now();
      if (res.kind === "fallback" && (res.reason === "rejected" || res.reason === "exception") && left > 1_000) {
        res = await stepWithin(input, left);
      }
      if (ended.current) return;
      // The transcript is the first message, then the turns (next never includes it).
      const opening = { role: "asker" as const, text: first };
      const withRefusal = res.kind !== "fallback" && res.refused ? [...next, { role: "guide" as const, text: refusalText, refusal: true }] : next;
      if (res.kind === "question") {
        setLines([opening, ...withRefusal, { role: "guide", text: res.question }]);
        setQuestion(res.question);
        setPhase("asking");
        onQuestion?.(res.question);
      } else if (res.kind === "summary") {
        setLines([opening, ...withRefusal]);
        setSummary(res.summary);
        setQuestion(null);
        setPhase("summary");
      } else {
        ended.current = true;
        setPhase("fallback");
        void guideSkipped({ questions: next.filter((l) => l.role === "guide" && !l.refusal).length, reason: "fallback" });
      }
    },
    [locale, refusalText, onQuestion],
  );

  /** The asker's first message, or an answer to the current question. */
  const submit = useCallback(
    (text: string) => {
      if (phase === "ask") {
        setFirstMessage(text);
        setLines([{ role: "asker", text }]);
        void step(text, []);
      } else if (phase === "asking") {
        const next = [...lines, { role: "asker" as const, text }];
        setLines(next);
        // The first line is the first message itself; the turns are what came after it.
        void step(firstMessage, next.slice(1));
      }
    },
    [phase, lines, firstMessage, step],
  );

  const skip = useCallback(() => {
    ended.current = true;
    setPhase("skipped");
    void guideSkipped({ questions: questionsAsked, reason: "skip" });
  }, [questionsAsked]);

  return { phase, lines, question, summary, firstMessage, questionsAsked, submit, skip };
}
