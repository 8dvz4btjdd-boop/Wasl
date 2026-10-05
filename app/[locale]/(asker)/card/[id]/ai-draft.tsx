"use client";

import { Info, PencilLine } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { AIBadge } from "@/components/ai/ai-badge";
import { AIStatus } from "@/components/ai/ai-status";
import { SourceChips } from "@/components/ai/source-chips";
import type { AIMetaClient, AIState } from "@/lib/ai/useAITask";
import { CARD_FIELD_MAX, CARD_FIELDS, UNDEFINED_FIELD, type CardField } from "@/lib/cards/types";
import type { MessageRow } from "@/lib/chat/types";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";

export type AIField = { text?: string; source_ids?: string[] };
export type AIDraftData = Record<CardField, AIField> & { undefined_fields?: CardField[] };

/** "What the AI guide will read: 3 messages you chose · it won't read 5 others." The consent line. */
export function ConsentLine({ selected, total }: { selected: number; total: number }) {
  const t = useTranslations("Card");
  const others = total - selected;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-brand-teal/40 bg-teal-bg px-3 py-2 text-sm">
      <span className="font-medium">{t("consentLead")}</span>
      <span>{t("consentReads", { count: selected })}</span>
      {others > 0 && (
        <>
          <span aria-hidden className="text-muted-foreground">
            ·
          </span>
          <span className="text-muted-foreground">{t("consentSkips", { count: others })}</span>
        </>
      )}
    </p>
  );
}

/** What the model read, numbered for the source chips (messages, or session cards). */
export type DraftSource = { id: string; body: string; muted?: boolean };

type AIDraftProps = {
  messages: MessageRow[];
  me: string;
  /** Instead of messages: the sources to list (the master card's session cards). */
  sources?: DraftSource[];
  /** Instead of the message consent line. */
  consent?: React.ReactNode;
  /** The messages sent to the model (the latest of the selection, up to the limit). */
  selected: Set<string>;
  /** Everything the asker selected (more than sent when over the limit). */
  totalSelected: number;
  state: AIState;
  meta: AIMetaClient | null;
  /** The streaming partial, then the validated draft. */
  draft: Partial<AIDraftData> | null;
  /** The validated draft texts ("" for undefined), to mark the asker's edits. */
  generated: Record<CardField, string> | null;
  fields: Record<CardField, string>;
  onChange: (field: CardField, value: string) => void;
};

/**
 * The AI draft: the selection it read (numbered, highlighted from the chips), then the four
 * fields filling in as the model writes, each with its source chips. Once done, every field
 * is editable; an edited field is marked "edited by you".
 */
export function AIDraft({ messages, me, sources, consent, selected, totalSelected, state, meta, draft, generated, fields, onChange }: AIDraftProps) {
  const t = useTranslations("Card");
  const tAI = useTranslations("AI");
  const format = new Intl.NumberFormat(useLocale());
  const [active, setActive] = useState<string | null>(null);
  const chosen = useMemo<DraftSource[]>(
    () => sources ?? messages.filter((m) => selected.has(m.id)).map((m) => ({ id: m.id, body: m.body, muted: m.sender_id !== me })),
    [sources, messages, selected, me],
  );
  const numberOf = useMemo(() => new Map(chosen.map((m, i) => [m.id, i + 1])), [chosen]);
  const editable = state === "done";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <AIStatus state={state} steps={[tAI("readingSelected"), tAI("drafting")]} meta={meta} />
        <AIBadge />
      </div>
      {consent ?? <ConsentLine selected={chosen.length} total={messages.length} />}
      {!sources && totalSelected > chosen.length && <p className="text-sm text-muted-foreground">{t("aiLatestOnly", { count: chosen.length })}</p>}

      <ol className="flex flex-col gap-1.5">
        {chosen.map((m) => (
          <li
            key={m.id}
            className={cn(
              "flex items-start gap-2 rounded-xl border px-3 py-2 text-sm transition-colors duration-150",
              active === m.id ? "border-brand-teal bg-teal-bg" : "border-transparent bg-muted/50",
            )}
          >
            <span className="mt-px grid h-5 min-w-5 place-items-center rounded-full border border-brand-teal/50 px-1 text-[11px] font-semibold text-teal-fg tabular-nums">
              {format.format(numberOf.get(m.id)!)}
            </span>
            <span dir="auto" className={cn("min-w-0 flex-1 break-words whitespace-pre-wrap", m.muted && "text-muted-foreground")}>
              {m.body}
            </span>
          </li>
        ))}
      </ol>

      <p className="flex items-center gap-2 text-sm text-violet-fg">
        <Info className="size-4 shrink-0" aria-hidden />
        {t("aiDraftLabel")}
      </p>

      <div className="flex flex-col gap-5">
        {CARD_FIELDS.map((field) => {
          const part = draft?.[field];
          const sources = part?.source_ids ?? [];
          const streamingText = part?.text ?? "";
          const isUndefined = editable ? !fields[field].trim() : streamingText.trim() === UNDEFINED_FIELD;
          const edited = editable && generated !== null && fields[field].trim() !== generated[field].trim();
          const show = editable || part !== undefined;
          return (
            <motion.div key={field} variants={fadeUp} initial="hidden" animate={show ? "visible" : "hidden"} className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={`card-${field}`} className="font-medium">
                  {t(field)}
                </label>
                {!isUndefined && <SourceChips ids={sources} numberOf={numberOf} active={active} onHighlight={setActive} />}
                {edited && (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <PencilLine className="size-3" aria-hidden />
                    {t("editedByYou")}
                  </span>
                )}
              </div>
              {editable ? (
                <textarea
                  id={`card-${field}`}
                  value={fields[field]}
                  onChange={(e) => onChange(field, e.target.value)}
                  maxLength={CARD_FIELD_MAX}
                  rows={2}
                  dir="auto"
                  placeholder={UNDEFINED_FIELD}
                  title={isUndefined ? t("notInSelection") : undefined}
                  className={cn(
                    "field-sizing-content min-h-14 w-full resize-none rounded-xl border bg-input/30 px-4 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground/80 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                    isUndefined ? "border-dashed border-muted-foreground/40" : "border-input",
                  )}
                />
              ) : (
                <p
                  dir="auto"
                  title={isUndefined ? t("notInSelection") : undefined}
                  className={cn(
                    "min-h-14 rounded-xl border px-4 py-3 text-base",
                    isUndefined ? "border-dashed border-muted-foreground/40 text-muted-foreground" : "border-input bg-input/30",
                  )}
                >
                  {streamingText}
                  {state === "streaming" && !isUndefined && <span aria-hidden className="ms-0.5 inline-block h-4 w-0.5 animate-pulse bg-brand-teal align-middle motion-reduce:animate-none" />}
                </p>
              )}
              {isUndefined && editable && <span className="text-xs text-muted-foreground">{t("notInSelection")}</span>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
