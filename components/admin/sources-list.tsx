"use client";

import { Check, ExternalLink, Trash2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { languageName } from "@/components/chat/format";
import { Button } from "@/components/ui/button";
import { promoteReading, removeReading } from "@/lib/admin/library";

export type AutoReading = { id: string; title: string; text: string; url: string; topic: string; language: string; asker_ok: boolean; created_at: string };

/** Readings the fence verified automatically: promote one to human-verified, or remove it. */
export function SourcesList({ items }: { items: AutoReading[] }) {
  const t = useTranslations("Admin.sources");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const [rows, setRows] = useState(items);
  const [pending, startTransition] = useTransition();

  const act = (id: string, action: "promote" | "remove") =>
    startTransition(async () => {
      const res = action === "promote" ? await promoteReading(id) : await removeReading(id);
      if (res.ok) setRows((list) => list.filter((r) => r.id !== id));
    });

  if (rows.length === 0) {
    return <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">{t("empty")}</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <li key={r.id} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded-full bg-muted px-2 leading-5">{tTopic(r.topic as never)}</span>
            <span className="rounded-full bg-muted px-2 leading-5">{languageName(r.language, locale)}</span>
            {!r.asker_ok && <span className="rounded-full bg-warning-bg px-2 leading-5 text-warning-fg">{t("daeeOnly")}</span>}
          </div>
          <p dir="auto" className="text-sm font-medium">
            {r.title}
          </p>
          <blockquote dir="auto" className="border-s-2 border-brand-teal/60 ps-3 text-sm whitespace-pre-wrap">
            {r.text}
          </blockquote>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              dir="ltr"
              className="inline-flex min-w-0 items-center gap-1 text-xs text-teal-fg underline-offset-4 hover:underline"
            >
              <span className="truncate">{r.url}</span>
              <ExternalLink className="size-3 shrink-0" aria-hidden />
            </a>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={pending} onClick={() => act(r.id, "promote")}>
                <Check aria-hidden />
                {t("promote")}
              </Button>
              <Button size="sm" variant="ghost" disabled={pending} onClick={() => act(r.id, "remove")}>
                <Trash2 aria-hidden />
                {t("remove")}
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
