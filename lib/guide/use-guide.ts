"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { guideFinish, guideStep, type GuideSummary } from "./actions";

export type GuidePhase = "starting" | "asking" | "thinking" | "summary" | "confirmed" | "skipped" | "fallback" | "stopped";
export type GuideLine = { role: "asker" | "guide"; text: string; refusal?: boolean };

const KEY = (id: string) => `wasl.guide.${id}`;
const EVENT = "wasl:guide";
function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}
function readStored(id: string): string | null {
  try {
    return sessionStorage.getItem(KEY(id));
  } catch {
    return null;
  }
}
function store(id: string, value: string) {
  try {
    sessionStorage.setItem(KEY(id), value);
  } catch {
    // Storage blocked: the guide may just run again on reload.
  }
  window.dispatchEvent(new Event(EVENT));
}

type Options = {
  conversationId: string;
  locale: string;
  /** AI on, nobody assigned yet, and no confirmed summary on the conversation. */
  enabled: boolean;
  /** A daee joined: stop mid-step and use whatever summary exists. */
  stopped: boolean;
  /** The guide's line for a religious question (shown, never answered). */
  refusalText: string;
  onQuestion?: (question: string) => void;
};

/**
 * The guide's state machine, one question at a time: the first message, at most three
 * questions, then a summary the asker confirms (or changes). Skip, AI failure and a daee
 * joining all end it without losing anything: the asker simply waits as before.
 */
export function useGuide({ conversationId, locale, enabled, stopped, refusalText, onQuestion }: Options) {
  const stored = useSyncExternalStore(subscribe, () => readStored(conversationId), () => null);
  const [phase, setPhase] = useState<GuidePhase>("starting");
  const [lines, setLines] = useState<GuideLine[]>([]);
  const [question, setQuestion] = useState<string | null>(null);
  const [summary, setSummary] = useState<GuideSummary | null>(null);
  const [proposedTopic, setProposedTopic] = useState<GuideSummary["topic"] | null>(null);
  const started = useRef(false);
  const finished = useRef(false);
  const questionCallback = useRef(onQuestion);
  useEffect(() => {
    questionCallback.current = onQuestion;
  }, [onQuestion]);

  const questionsAsked = lines.filter((l) => l.role === "guide" && !l.refusal).length;

  const step = useCallback(
    async (next: GuideLine[]) => {
      setPhase("thinking");
      const res = await guideStep({ conversationId, locale, turns: next.filter((l) => !l.refusal).map(({ role, text }) => ({ role, text })) });
      if (finished.current) return;
      const withRefusal = "refused" in res && res.refused ? [...next, { role: "guide" as const, text: refusalText, refusal: true }] : next;
      if (res.kind === "question") {
        setLines([...withRefusal, { role: "guide", text: res.question }]);
        setQuestion(res.question);
        setPhase("asking");
        questionCallback.current?.(res.question);
      } else if (res.kind === "summary") {
        setLines(withRefusal);
        setSummary(res.summary);
        setProposedTopic(res.summary.topic);
        setQuestion(null);
        setPhase("summary");
      } else if (res.kind === "stopped") {
        finished.current = true;
        setPhase("stopped");
      } else {
        finished.current = true;
        store(conversationId, "fallback");
        setPhase("fallback");
        void guideFinish({ conversationId, summary: null, proposedTopic: null, questions: next.filter((l) => l.role === "guide" && !l.refusal).length, skipped: false });
      }
    },
    [conversationId, locale, refusalText],
  );

  // Start once, when the guide applies and hasn't already ended for this conversation.
  useEffect(() => {
    if (!enabled || stored || started.current) return;
    started.current = true;
    void step([]);
  }, [enabled, stored, step]);

  // A daee joined: stop now; a summary that exists is still used.
  useEffect(() => {
    if (!stopped || finished.current || !started.current) return;
    finished.current = true;
    void guideFinish({ conversationId, summary, proposedTopic, questions: questionsAsked, skipped: false });
  }, [stopped, conversationId, summary, proposedTopic, questionsAsked]);

  const answer = useCallback(
    (text: string) => {
      if (phase !== "asking") return;
      void step([...lines, { role: "asker", text }]);
    },
    [phase, lines, step],
  );

  const skip = useCallback(() => {
    finished.current = true;
    store(conversationId, "skipped");
    setPhase("skipped");
    void guideFinish({ conversationId, summary: null, proposedTopic: null, questions: questionsAsked, skipped: true });
  }, [conversationId, questionsAsked]);

  const confirm = useCallback(
    async (topic: GuideSummary["topic"]) => {
      if (!summary || finished.current) return;
      finished.current = true;
      const confirmed = { ...summary, topic };
      // Saved first: the readings that follow are built from the confirmed summary.
      await guideFinish({ conversationId, summary: confirmed, proposedTopic, questions: questionsAsked, skipped: false });
      setSummary(confirmed);
      setPhase("confirmed");
      store(conversationId, "confirmed");
    },
    [summary, conversationId, proposedTopic, questionsAsked],
  );

  const effectivePhase: GuidePhase = !enabled ? "fallback" : stored === "confirmed" && phase !== "confirmed" ? "confirmed" : stored && phase === "starting" ? (stored as GuidePhase) : phase;
  return { phase: effectivePhase, lines, question, summary, questionsAsked, answer, skip, confirm };
}
