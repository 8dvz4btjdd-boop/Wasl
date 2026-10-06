"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/** BCP 47 codes for speech per app locale. */
const SPEECH_LANG: Record<string, string> = {
  ar: "ar-SA",
  en: "en-US",
  fr: "fr-FR",
  es: "es-ES",
  ur: "ur-PK",
  id: "id-ID",
  tl: "fil-PH",
};
export const speechLang = (locale: string) => SPEECH_LANG[locale] ?? locale;

type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error?: string }) => void) | null;
};
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const noop = () => () => {};

// The mic can't be used on this device or was refused: hide it, the asker types.
const MIC_UNAVAILABLE = new Set(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported"]);

/**
 * Speech in (Web Speech API) in the locale's language. Unsupported browsers, a refused
 * permission or a missing microphone give supported = false and the asker types instead.
 * Interim text streams into `onText`, which fills the input for the asker to edit and send.
 */
export function useSpeechInput(locale: string, onText: (text: string, final: boolean) => void) {
  const available = useSyncExternalStore(noop, () => recognitionCtor() !== null, () => false);
  const [refused, setRefused] = useState(false);
  const supported = available && !refused;
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  useEffect(() => {
    callback.current = onText;
  }, [onText]);

  const stop = useCallback(() => rec.current?.stop(), []);
  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    rec.current?.abort();
    const r = new Ctor();
    r.lang = speechLang(locale);
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => {
      let text = "";
      let final = false;
      for (let i = 0; i < e.results.length; i++) {
        text += e.results[i][0].transcript;
        final = final || e.results[i].isFinal;
      }
      callback.current(text, final);
    };
    r.onend = () => setListening(false);
    r.onerror = (e) => {
      console.info(`[guide voice] mic error=${e.error ?? "unknown"}`);
      setListening(false);
      if (e.error && MIC_UNAVAILABLE.has(e.error)) setRefused(true);
    };
    rec.current = r;
    try {
      r.start();
      setListening(true);
    } catch (error) {
      console.info(`[guide voice] mic start failed: ${String(error)}`);
      setRefused(true);
    }
  }, [locale]);

  useEffect(() => () => rec.current?.abort(), []);
  return { supported, listening, start, stop };
}

/**
 * Speech out: the server's ElevenLabs proxy when it's configured (the key never reaches the
 * browser), else the browser's speechSynthesis. Browsers block audio until a user gesture,
 * so nothing plays until the asker taps "listen" (or the mic) once (`unlock`); from then on
 * every guide question is spoken for the rest of the session, never while muted. The flags
 * live in refs too, so a question that arrives after the tap (from a step started before
 * it) still speaks.
 */
export function useSpeechOutput(locale: string) {
  const [muted, setMuted] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const flags = useRef({ muted: false, unlocked: false });

  const stop = useCallback(() => {
    audio.current?.pause();
    if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    async (text: string, force = false) => {
      if (flags.current.muted || (!flags.current.unlocked && !force) || !text.trim()) return;
      stop();
      setSpeaking(true);
      try {
        const res = await fetch("/api/tts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, locale }) });
        console.info(`[guide voice] ${res.headers.get("x-tts-path") ?? "fallback"}${res.headers.get("x-tts-reason") ? ` reason=${res.headers.get("x-tts-reason")}` : ""}`);
        if (res.status === 200 && res.headers.get("content-type")?.startsWith("audio/")) {
          const url = URL.createObjectURL(await res.blob());
          const el = new Audio(url);
          audio.current = el;
          el.onended = el.onerror = el.onpause = () => {
            URL.revokeObjectURL(url);
            setSpeaking(false);
          };
          await el.play();
          return;
        }
      } catch (error) {
        console.info(`[guide voice] audio failed, using the browser voice: ${String(error)}`);
      }
      if ("speechSynthesis" in window) {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = speechLang(locale);
        u.onend = () => setSpeaking(false);
        u.onerror = () => setSpeaking(false);
        window.speechSynthesis.speak(u);
      } else {
        setSpeaking(false);
      }
    },
    [locale, stop],
  );

  useEffect(() => stop, [stop]);
  return {
    muted,
    speaking,
    unlocked,
    unlock: () => {
      flags.current.unlocked = true;
      setUnlocked(true);
    },
    toggleMute: () => {
      flags.current.muted = !flags.current.muted;
      setMuted(flags.current.muted);
      stop();
    },
    speak,
    stop,
  };
}
