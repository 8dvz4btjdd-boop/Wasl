"use client";

import { Mic, MicOff, Volume2, VolumeX } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The guide's voice controls beside the composer: the mic (with a clear listening state;
 * hidden where the browser can't do speech or the asker refused the microphone) and the
 * speaker (off until the asker taps it, "listen" or the mic once; then it mutes and unmutes).
 */
export function VoiceControls({
  micSupported,
  listening,
  soundOn,
  onMic,
  onSpeaker,
}: {
  micSupported: boolean;
  listening: boolean;
  soundOn: boolean;
  onMic: () => void;
  onSpeaker: () => void;
}) {
  const t = useTranslations("Guide");
  const base =
    "grid size-14 shrink-0 place-items-center rounded-2xl border transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none";
  return (
    <>
      <button type="button" onClick={onSpeaker} aria-label={soundOn ? t("mute") : t("speaker")} aria-pressed={soundOn} className={cn(base, "text-muted-foreground hover:text-foreground")}>
        {soundOn ? <Volume2 className="size-5" aria-hidden /> : <VolumeX className="size-5" aria-hidden />}
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
