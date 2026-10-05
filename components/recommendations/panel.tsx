"use client";

import { BookOpen, ExternalLink, LoaderCircle, RefreshCw, Sparkles } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ChatMessage } from "@/lib/chat/types";
import type { RecommendationAudience, RecommendationStatus } from "@/lib/recommendations/types";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useContextualRecommendations } from "./use-contextual-recommendations";

type Props = {
  conversationId: string;
  messages: ChatMessage[];
  audience: RecommendationAudience;
  aiEnabled: boolean;
  active: boolean;
  className?: string;
};

const STATUS_KEYS: Record<RecommendationStatus, string> = {
  sufficient: "sufficient", partial: "partial", needs_clarification: "needsClarification",
  unavailable: "unavailable", refer: "refer", disabled: "disabled", unchanged: "unchanged", pending: "pending",
};

/** Original passages and specific references; this never sends a reply into the conversation. */
export function RecommendationPanel({ conversationId, messages, audience, aiEnabled, active, className }: Props) {
  const t = useTranslations("Recommendations");
  const locale = useLocale();
  const { phase, result, error, contextVersion, refresh, expand } = useContextualRecommendations({
    conversationId, messages, audience, locale, enabled: aiEnabled && active,
  });
  const busy = phase === "queued" || phase === "loading";
  if (!active) return null;

  return (
    <section aria-label={t(audience === "asker" ? "askerTitle" : "daeeTitle")} aria-busy={busy}
      data-testid={`recommendations-${audience}`}
      className={cn("flex flex-col gap-3 rounded-xl border border-brand-violet/20 bg-card p-4 text-sm", className)}>
      <div className="flex items-center gap-2">
        <BookOpen className="size-4 shrink-0 text-brand-violet" aria-hidden />
        <h3 className="flex-1 font-semibold">{t(audience === "asker" ? "askerTitle" : "daeeTitle")}</h3>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">{t("aiGuide")}</span>
      </div>
      <p className="text-xs text-muted-foreground">{t(audience === "asker" ? "askerHint" : "daeeHint")}</p>

      <div role="status" aria-live="polite" aria-atomic="true" className="flex gap-2 text-sm">
        {busy && <LoaderCircle className="mt-0.5 size-4 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />}
        <p>{!aiEnabled ? t("disabled") : busy ? t(phase === "queued" ? "queued" : "loading") : error ? t(error === "access" ? "accessError" : "error") :
          result ? t(STATUS_KEYS[result.status] as never) : t("initial")}</p>
      </div>

      {result?.clarification && !busy && !error && (
        <p className="rounded-lg bg-muted p-3 font-medium">{t(result.clarification === "choose_aspect" ? "clarifyAspect" : "clarifyQuestion")}</p>
      )}

      {!error && result?.materials.filter((material) => audience === "daee" || material.review !== "daee_evaluation_required").map((material) => (
        <article key={material.id} className="flex min-w-0 flex-col gap-2 border-t pt-3">
          <h4 dir="auto" className="font-medium">{material.title}</h4>
          <span className="w-fit rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
            {t(material.review === "released" ? "verbatim" : material.review === "daee_evaluation_required" ? "needsReview" : "sourceOnly")}
          </span>
          {material.bodyVerbatim && material.review !== "source_only" && <blockquote dir="auto" className="border-s-2 border-brand-violet/40 ps-3 text-sm leading-7 whitespace-pre-wrap">{material.bodyVerbatim}</blockquote>}
          <p dir="auto" className="text-xs text-muted-foreground">{material.locator}</p>
          <a href={material.sourceUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"
            className="flex w-fit max-w-full items-center gap-1 text-xs text-brand-violet underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none">
            <span>{t("openSource")}</span><ExternalLink className="size-3 shrink-0" aria-hidden />
          </a>
        </article>
      ))}

      {aiEnabled && contextVersion && (
        <div className="flex flex-wrap gap-2 border-t pt-3">
          <Button variant="outline" size="sm" disabled={busy} onClick={refresh}>
            <RefreshCw className="size-3.5" aria-hidden />{t(error || result?.status === "unavailable" ? "retry" : "refresh")}
          </Button>
          <Button variant="ghost" size="sm" disabled={busy} onClick={expand}>
            <Sparkles className="size-3.5" aria-hidden />{t("expand")}
          </Button>
          <p className="basis-full text-[11px] text-muted-foreground">{t(result?.reason === "spending_disabled" || result?.reason === "paid_research_disabled" ? "localOnly" : "expansionHint")}</p>
        </div>
      )}
    </section>
  );
}
