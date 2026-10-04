"use client";

import { ArrowLeftRight, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { languageName } from "@/components/chat/format";
import { Button } from "@/components/ui/button";
import { getTransferCandidates, transferConversation, type TransferCandidate } from "@/lib/inbox/actions";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";

type TransferMenuProps = {
  conversationId: string;
  askerLanguage: string;
  onDone: (status: "completed" | "pending") => void;
};

/** Hand the conversation to an available colleague who speaks the asker's language. */
export function TransferMenu({ conversationId, askerLanguage, onDone }: TransferMenuProps) {
  const t = useTranslations("Inbox");
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<TransferCandidate[] | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [askCard, setAskCard] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onClick = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onClick);
    };
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    setFailed(false);
    if (next) {
      setCandidates(null);
      setTarget(null);
      void getTransferCandidates(conversationId).then((list) => setCandidates(list ?? []));
    }
  }

  const confirm = () =>
    startTransition(async () => {
      if (!target) return;
      const result = await transferConversation({ conversationId, toDaee: target, askCard });
      if (!result.ok) return setFailed(true);
      setOpen(false);
      onDone(result.status);
    });

  return (
    <div ref={panel} className="relative">
      <Button size="sm" variant="outline" aria-expanded={open} aria-haspopup="dialog" onClick={toggle}>
        <ArrowLeftRight className="rtl:-scale-x-100" aria-hidden />
        {t("transfer")}
      </Button>
      {open && (
        <div role="dialog" aria-label={t("transferTitle")} className="absolute end-0 top-full z-30 mt-2 flex w-72 flex-col gap-3 rounded-xl border bg-popover p-3 text-popover-foreground shadow-lg">
          <p className="text-xs font-medium text-muted-foreground">{t("transferTitle")}</p>
          {candidates === null ? (
            <Loader2 className="mx-auto size-4 animate-spin text-muted-foreground" aria-hidden />
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("noCandidates", { language: languageName(askerLanguage, locale) })}</p>
          ) : (
            <ul role="radiogroup" className="flex flex-col gap-1">
              {candidates.map((c) => (
                <li key={c.user_id}>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={target === c.user_id}
                    onClick={() => setTarget(c.user_id)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start text-sm transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                      target === c.user_id ? "bg-accent text-accent-foreground" : "hover:bg-muted",
                    )}
                  >
                    <Avatar name={c.display_name} size="sm" />
                    <span className="flex-1 font-medium">{c.display_name}</span>
                    <span className="text-xs text-muted-foreground tabular-nums" dir="ltr">
                      {c.open}/{c.capacity}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <label className="flex items-center justify-between gap-3 text-sm">
            {t("askCard")}
            <input type="checkbox" checked={askCard} onChange={(e) => setAskCard(e.target.checked)} className="peer sr-only" />
            <span
              aria-hidden
              className={cn(
                "relative h-5 w-9 shrink-0 rounded-full transition-colors peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50",
                askCard ? "bg-teal-fg" : "bg-input",
              )}
            >
              <span className={cn("absolute top-0.5 size-4 rounded-full bg-white shadow transition-[inset-inline-start]", askCard ? "start-[18px]" : "start-0.5")} />
            </span>
          </label>
          {failed && <p className="text-xs text-destructive">{t("noCandidates", { language: languageName(askerLanguage, locale) })}</p>}
          <Button size="sm" disabled={!target || pending} onClick={confirm}>
            {t("confirmTransfer")}
          </Button>
        </div>
      )}
    </div>
  );
}
