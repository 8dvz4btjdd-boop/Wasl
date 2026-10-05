"use client";

import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The guide's voice controls beside the composer: the mic (with a clear listening state;
 * hidden where the browser can't do speech) and the speaker (tap once to hear the questions,
 * then it mutes and unmutes). Nothing plays before the asker taps one of them.
 */
export function VoiceControls({
  micSupported,
  listening,
  muted,
  onMic,
  onSpeaker,
}: {
  micSupported: boolean;
  listening: boolean;
  muted: boolean;
  onMic: () => void;
  onSpeaker: () => void;
}) {
  const t = useTranslations("Guide");
  const base =
    "grid size-14 shrink-0 place-items-center rounded-2xl border transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
  return (
    <>
      <button type="button" onClick={onSpeaker} aria-label={muted ? t("unmute") : t("speaker")} aria-pressed={!muted} className={cn(base, "text-muted-foreground hover:text-foreground")}>
        {muted ? <VolumeX className="size-5" aria-hidden /> : <Volume2 className="size-5" aria-hidden />}
      </button>
      {micSupported && (
        <button
          type="button"
          onClick={onMic}
          aria-label={listening ? t("stopListening") : t("speak")}
          aria-pressed={listening}
          className={cn(base, listening ? "border-brand-teal bg-brand-teal text-brand-navy" : "text-muted-foreground hover:text-foreground")}
        >
          {listening ? <MicOff className="size-5" aria-hidden /> : <Mic className="size-5" aria-hidden />}
          {listening && <span className="sr-only" aria-live="polite">{t("listening")}</span>}
        </button>
      )}
    </>
  );
}
