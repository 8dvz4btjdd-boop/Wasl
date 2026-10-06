"use client";

import { BookOpen, ExternalLink, Quote } from "lucide-react";
import { motion } from "motion/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { AIBadge } from "@/components/ai/ai-badge";
import { fadeUp, staggerChildren } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Reading = { id: string | null; title: string; text: string; url: string; verified_by: "human" | "auto" };

/**
 * Readings for a conversation's question, from the approved sources only: each passage is
 * the source's own words, verbatim, with its title and link. The search can take several
 * seconds, so the section shows a quiet loading state and fills in when ready.
 */
export function Readings({
  conversationId,
  tone = "asker",
  variant = "default",
  className,
}: {
  conversationId: string;
  tone?: "asker" | "workspace";
  /** suggested: the asker's waiting screen ("suggested for you"). */
  variant?: "default" | "suggested";
  className?: string;
}) {
  const t = useTranslations("Readings");
  const [state, setState] = useState<"loading" | "done" | "error">("loading");
  const [items, setItems] = useState<Reading[]>([]);

  useEffect(() => {
    let alive = true;
    fetch("/api/ai/sources", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ conversationId }) })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((data: { items: Reading[] }) => {
        if (!alive) return;
        setItems(data.items ?? []);
        setState("done");
      })
      .catch(() => alive && setState("error"));
    return () => {
      alive = false;
    };
  }, [conversationId]);

  const compact = tone === "workspace";

  return (
    <section data-testid="readings" aria-labelledby={`readings-${conversationId}`} aria-busy={state === "loading"} className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <BookOpen className={cn("text-teal-fg", compact ? "size-3.5" : "size-4")} aria-hidden />
        <h2 id={`readings-${conversationId}`} className={cn("font-semibold", compact ? "text-xs text-muted-foreground" : "text-sm")}>
          {variant === "suggested" ? t("suggested") : t("title")}
        </h2>
        <AIBadge />
      </div>

      {state === "loading" && (
        <div className="flex flex-col gap-2" role="status">
          <p className="text-xs text-muted-foreground">{t("loading")}</p>
          {[0, 1].map((i) => (
            <span key={i} className="h-14 animate-pulse rounded-xl bg-muted/70 motion-reduce:animate-none" />
          ))}
        </div>
      )}

      {state !== "loading" && items.length === 0 && (
        <p className="rounded-xl border border-dashed px-3 py-3 text-sm text-muted-foreground">{t("empty")}</p>
      )}

      {items.length > 0 && (
        <motion.ol variants={staggerChildren(0.08)} initial="hidden" animate="visible" className="flex flex-col gap-3">
          {items.map((item) => (
            <motion.li key={`${item.url}-${item.text.slice(0, 24)}`} variants={fadeUp} className={cn("flex flex-col gap-2 rounded-xl border bg-card", compact ? "p-3" : "p-4")}>
              <p className={cn("font-medium", compact ? "text-xs" : "text-sm")} dir="auto">
                {item.title}
              </p>
              <blockquote dir="auto" className={cn("flex gap-2 border-s-2 border-brand-teal/60 ps-3 leading-relaxed", compact ? "text-xs" : "text-[0.9375rem]")}>
                <Quote className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="whitespace-pre-wrap">{item.text}</span>
              </blockquote>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="rounded-full border px-2 leading-5">{t("excerpt")}</span>
                  {t("verbatim")}
                </span>
                {/* The API caps a passage at 150 characters: the full source is one tap away. */}
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-teal-fg underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {t("readFull")}
                  <span dir="ltr" className="font-normal text-muted-foreground">
                    ({new URL(item.url).hostname.replace(/^www\./, "")})
                  </span>
                  <ExternalLink className="size-3 shrink-0" aria-hidden />
                </a>
              </div>
            </motion.li>
          ))}
        </motion.ol>
      )}
    </section>
  );
}
