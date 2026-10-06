"use client";

import { useCallback, useRef, useState } from "react";
import { guideSkipped, guideStep, type GuideStep, type GuideSummary } from "./actions";

export type GuidePhase = "ask" | "asking" | "thinking" | "summary" | "fallback" | "skipped";
export type GuideLine = { role: "asker" | "guide"; text: string; refusal?: boolean };

const STEP_TIMEOUT_MS = 30_000;

/** A server step that can't hang the screen: a 30 s limit, then the caller decides. */
async function stepOnce(input: Parameters<typeof guideStep>[0]): Promise<GuideStep> {
  return Promise.race([
    guideStep(input),
    new Promise<GuideStep>((resolve) => setTimeout(() => resolve({ kind: "fallback", reason: "client_timeout" }), STEP_TIMEOUT_MS)),
  ]);
}

/**
 * The guide on the entry flow, before the conversation exists: the asker's question, then at
 * most three short questions, then a summary to confirm. Every failure (a rejected request,
 * a timeout, an AI fallback) is retried once and then ends the guide calmly: the asker gets
 * the plain question box with what they typed. Nothing can leave it stuck on "one moment".
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
      let res: GuideStep = await stepOnce(input).catch(() => ({ kind: "fallback", reason: "rejected" }) as GuideStep);
      if (res.kind === "fallback" && (res.reason === "rejected" || res.reason === "client_timeout" || res.reason === "exception")) {
        res = await stepOnce(input).catch(() => ({ kind: "fallback", reason: "rejected" }) as GuideStep);
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
