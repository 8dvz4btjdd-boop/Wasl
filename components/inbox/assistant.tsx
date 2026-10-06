"use client";

import { BookOpen, ExternalLink, Quote, Search, TextQuote } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { AIBadge } from "@/components/ai/ai-badge";
import { Button } from "@/components/ui/button";
import { assistSearch, assistTone, getAskerReadings } from "@/lib/assist/actions";
import type { Reading } from "@/lib/sources/readings";
import { cn } from "@/lib/utils";

export type AssistRequest = { messageIds: string[]; nonce: number } | null;
type Tone = "hurried" | "confused" | "frustrated" | "neutral" | "undefined";

/**
 * The daee's assistant (only for the assigned daee): what the asker was shown, searches of
 * the approved sources (for selected messages or anything typed), and how the recent
 * messages read. Citations only, never an answer; a quote goes into the composer, never sent.
 */
export function AssistantPanel({
  conversationId,
  aiEnabled,
  request,
  onInsert,
}: {
  conversationId: string;
  aiEnabled: boolean;
  request: AssistRequest;
  onInsert: (text: string) => void;
}) {
  const t = useTranslations("Assist");
  const [results, setResults] = useState<Reading[] | null>(null);
  const [searching, startSearch] = useTransition();
  const [query, setQuery] = useState("");
  const [seen, setSeen] = useState<Reading[] | null>(null);
  const [tone, setTone] = useState<Tone | null>(null);
  const [toneLoading, startTone] = useTransition();

  const search = (input: { messageIds?: string[]; query?: string }) =>
    startSearch(async () => {
      const res = await assistSearch({ conversationId, ...input });
      setResults(res.items);
    });

  // A sparkle (or "search selected") in the conversation sends a request here.
  const handled = useRef<number | null>(null);
  useEffect(() => {
    if (!request || handled.current === request.nonce) return;
    handled.current = request.nonce;
    startSearch(async () => {
      const res = await assistSearch({ conversationId, messageIds: request.messageIds });
      setResults(res.items);
    });
  }, [request, conversationId]);

  return (
    <div data-testid="assistant" className="flex flex-col gap-5 px-4 py-4">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t("title")}</h3>
        <AIBadge />
      </div>

      {aiEnabled && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          {tone ? (
            <p data-testid="tone" className="text-muted-foreground">
              {tone === "undefined" ? t("toneUndefined") : t("toneLine", { tone: t(`tone_${tone}`) })}
            </p>
          ) : (
            <button
              type="button"
              disabled={toneLoading}
              onClick={() => startTone(async () => setTone((await assistTone(conversationId)) ?? "undefined"))}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground disabled:opacity-60"
            >
              {toneLoading ? t("reading") : t("readTone")}
            </button>
          )}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) search({ query });
        }}
        className="flex items-center gap-2"
      >
        <label className="relative flex-1">
          <span className="sr-only">{t("searchLabel")}</span>
          <Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchLabel")}
            className="h-9 w-full rounded-lg border bg-background ps-8 pe-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </label>
        <Button type="submit" size="sm" variant="outline" disabled={searching || !query.trim()}>
          {t("search")}
        </Button>
      </form>

      <section aria-live="polite" aria-busy={searching} className="flex flex-col gap-3">
        {searching && (
          <div className="flex flex-col gap-2" role="status">
            <p className="text-xs text-muted-foreground">{t("searching")}</p>
            {[0, 1].map((i) => (
              <span key={i} className="h-12 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
            ))}
          </div>
        )}
        {!searching && results && results.length === 0 && <p className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">{t("noResults")}</p>}
        {!searching && results && results.length > 0 && (
          <ol data-testid="assist-results" className="flex flex-col gap-3">
            {results.map((r) => (
              <ResultItem key={`${r.url}-${r.text.slice(0, 20)}`} reading={r} onInsert={onInsert} />
            ))}
          </ol>
        )}
      </section>

      <details
        className="rounded-lg border"
        onToggle={(e) => {
          if ((e.target as HTMLDetailsElement).open && seen === null) void getAskerReadings(conversationId).then((r) => setSeen(r ?? []));
        }}
      >
        <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-xs font-medium text-muted-foreground">
          <BookOpen className="size-3.5" aria-hidden />
          {t("seenTitle")}
        </summary>
        <div className="flex flex-col gap-2 px-3 pb-3">
          {seen === null ? (
            <span className="h-10 animate-pulse rounded bg-muted motion-reduce:animate-none" />
          ) : seen.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t("seenNone")}</p>
          ) : (
            <ol data-testid="seen-readings" className="flex flex-col gap-2">
              {seen.map((r) => (
                <ResultItem key={`seen-${r.url}-${r.text.slice(0, 20)}`} reading={r} onInsert={onInsert} seen />
              ))}
            </ol>
          )}
        </div>
      </details>
    </div>
  );
}

function ResultItem({ reading: r, onInsert, seen = false }: { reading: Reading; onInsert: (text: string) => void; seen?: boolean }) {
  const t = useTranslations("Assist");
  const tReadings = useTranslations("Readings");
  return (
    <li className={cn("flex flex-col gap-2 rounded-lg border bg-background p-3", seen && "bg-muted/40")}>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
        {seen && <span className="rounded-full bg-muted px-2 leading-5">{t("seenLabel")}</span>}
        {r.feqhia && <span className="rounded-full bg-warning-bg px-2 leading-5 font-medium text-warning-fg">{t("feqhia")}</span>}
        <span className="rounded-full border px-2 leading-5">{tReadings("verbatim")}</span>
      </div>
      <p dir="auto" className="text-xs font-medium">
        {r.title}
      </p>
      <blockquote dir="auto" className="flex gap-1.5 border-s-2 border-brand-teal/60 ps-2.5 text-xs leading-relaxed whitespace-pre-wrap">
        <Quote className="mt-0.5 size-3 shrink-0 text-muted-foreground" aria-hidden />
        <span>{r.text}</span>
      </blockquote>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <a href={r.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] font-medium text-teal-fg underline underline-offset-4">
          {tReadings("readFull")}
          <ExternalLink className="size-3" aria-hidden />
        </a>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onInsert(`«${r.text}»\n${r.url}`)}>
          <TextQuote aria-hidden />
          {t("insertQuote")}
        </Button>
      </div>
    </li>
  );
}
