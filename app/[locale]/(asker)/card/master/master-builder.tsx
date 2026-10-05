"use client";

import { Check, X } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { CardView } from "@/components/cards/card-view";
import { Surface } from "@/components/surface";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useAITask } from "@/lib/ai/useAITask";
import { submitMasterCard } from "@/lib/cards/master";
import { CARD_FIELD_MAX, CARD_FIELDS, DURATIONS, isUndefinedField, UNDEFINED_FIELD, VISIBILITIES, type Card, type CardField, type Duration, type Visibility } from "@/lib/cards/types";
import { fadeUp, sheetIn, staggerChildren } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AIDraft, type AIDraftData } from "../[id]/ai-draft";
import { Option, OptionGroup, StepTitle } from "../[id]/card-builder";

type Step = "fields" | "sharing" | "review";
const STEPS: Step[] = ["fields", "sharing", "review"];

type MasterBuilderProps = {
  /** Approved session cards to merge, oldest first. */
  sessions: Card[];
  /** The current approved master, prefilled when AI is off or unavailable. */
  previous: Card | null;
  aiEnabled: boolean;
  daeeName: string | null;
  backTo: string;
};

const textsOf = (card: Card | null): Record<CardField, string> =>
  Object.fromEntries(CARD_FIELDS.map((f) => [f, card && !isUndefinedField(card[f]) ? (card[f] ?? "") : ""])) as Record<CardField, string>;

/**
 * Update the master card: with AI on, the guide merges the approved session cards (fields
 * stream in with chips pointing at the session cards); otherwise the current master is
 * prefilled. The asker edits, chooses who sees it and for how long, and approves.
 */
export function MasterBuilder({ sessions, previous, aiEnabled, daeeName, backTo }: MasterBuilderProps) {
  const t = useTranslations("Card");
  const locale = useLocale();
  const [step, setStep] = useState<Step>("fields");
  const [mode, setMode] = useState<"ai" | "manual">(aiEnabled ? "ai" : "manual");
  const [fields, setFields] = useState<Record<CardField, string>>(() => textsOf(previous));
  const [generated, setGenerated] = useState<Record<CardField, string> | null>(null);
  const [aiUnavailable, setAIUnavailable] = useState(false);
  const [visibility, setVisibility] = useState<Visibility>(previous?.visibility ?? "this_daee");
  const [days, setDays] = useState<Duration>("forever");
  const [result, setResult] = useState<"approved" | "draft" | "error" | null>(null);
  const [pending, startTransition] = useTransition();
  const ai = useAITask<AIDraftData>("/api/ai/master");
  const started = useRef(false);
  const index = STEPS.indexOf(step);
  const format = new Intl.NumberFormat(locale);
  const date = (iso: string | null) => (iso ? new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso)) : "");

  // The merge starts on arrival when AI is on (the asker came here to update it).
  useEffect(() => {
    if (!aiEnabled || started.current) return;
    started.current = true;
    void ai.run({ locale });
  }, [aiEnabled, ai, locale]);

  const [seenAI, setSeenAI] = useState(ai.state);
  if (seenAI !== ai.state) {
    setSeenAI(ai.state);
    if (ai.state === "done" && ai.data && mode === "ai") {
      const texts = Object.fromEntries(CARD_FIELDS.map((f) => [f, ai.data![f].text === UNDEFINED_FIELD ? "" : (ai.data![f].text ?? "")])) as Record<CardField, string>;
      setGenerated(texts);
      setFields(texts);
    }
    if (ai.state === "fallback" && mode === "ai") {
      setMode("manual");
      setAIUnavailable(true);
    }
  }

  const sources = useMemo(
    () => sessions.map((c) => ({ id: c.id, body: `${date(c.approved_at)} · ${isUndefinedField(c.follow_up) ? t("undefined") : c.follow_up}` })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessions],
  );

  const submit = (approve: boolean) =>
    startTransition(async () => {
      const res = await submitMasterCard({
        sourceCardIds: sessions.map((c) => c.id),
        fields,
        visibility,
        days,
        approve,
        ai:
          mode === "ai" && ai.data
            ? {
                draft: Object.fromEntries(CARD_FIELDS.map((f) => [f, ai.data![f].text ?? UNDEFINED_FIELD])) as Record<CardField, string>,
                sources: Object.fromEntries(CARD_FIELDS.map((f) => [f, ai.data![f].source_ids ?? []])) as Record<CardField, string[]>,
              }
            : null,
      });
      setResult(!res.ok ? "error" : approve ? "approved" : "draft");
    });

  const header = (
    <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pt-4 sm:px-6">
      <h1 className="text-lg font-semibold">{t("masterTitle")}</h1>
      <Link
        href={backTo}
        aria-label={t("backToChat")}
        className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X className="size-5" aria-hidden />
      </Link>
    </header>
  );

  if (result === "approved") {
    return (
      <Surface kind="asker" className="flex min-h-dvh flex-col">
        {header}
        <motion.main variants={sheetIn} initial="hidden" animate="visible" className="mx-auto mt-6 flex w-full max-w-2xl flex-1 flex-col gap-6 rounded-t-3xl border-x border-t bg-card px-5 py-6 sm:px-8">
          <p className="flex items-center gap-2 text-sm font-medium text-teal-fg">
            <Check className="size-4" aria-hidden />
            {t("masterApproved", { count: sessions.length })}
          </p>
          <CardView fields={fields} />
          <Link href={backTo} className={cn(buttonVariants({ size: "lg" }), "h-12 self-start px-5 text-base")}>
            {t("backToChat")}
          </Link>
        </motion.main>
      </Surface>
    );
  }

  const canContinue = step !== "fields" || mode === "manual" || ai.state === "done";

  return (
    <Surface kind="asker" className="flex h-dvh flex-col">
      {header}
      <div className="mx-auto mt-4 flex w-full max-w-2xl gap-1.5 px-4 sm:px-6" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors duration-200", i <= index ? "bg-brand-teal" : "bg-muted")} />
        ))}
      </div>
      <motion.section variants={sheetIn} initial="hidden" animate="visible" className="mx-auto mt-4 flex min-h-0 w-full max-w-2xl flex-1 flex-col rounded-t-3xl border-x border-t bg-card">
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <motion.div key={step + mode} variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-6">
            {step === "fields" && mode === "ai" && (
              <>
                <StepTitle title={t("masterTitle")} hint={t("masterHint")} />
                <AIDraft
                  messages={[]}
                  me=""
                  sources={sources}
                  consent={
                    <p className="rounded-xl border border-brand-teal/40 bg-teal-bg px-3 py-2 text-sm">
                      <span className="font-medium">{t("consentLead")}</span> {t("masterConsent", { count: sessions.length })}
                    </p>
                  }
                  selected={new Set()}
                  totalSelected={sessions.length}
                  state={ai.state}
                  meta={ai.meta}
                  draft={ai.state === "done" ? ai.data : (ai.partial as Partial<AIDraftData> | null)}
                  generated={generated}
                  fields={fields}
                  onChange={(field, value) => setFields({ ...fields, [field]: value })}
                />
              </>
            )}
            {step === "fields" && mode === "manual" && (
              <>
                {aiUnavailable && <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">{t("aiUnavailable")}</p>}
                <StepTitle title={t("masterTitle")} hint={previous ? t("masterPrefilled", { version: format.format(previous.version) }) : t("emptyNote")} />
                <motion.div variants={staggerChildren(0.06)} initial="hidden" animate="visible" className="flex flex-col gap-5">
                  {CARD_FIELDS.map((field) => (
                    <motion.div key={field} variants={fadeUp} className="flex flex-col gap-1.5">
                      <label htmlFor={`master-${field}`} className="font-medium">
                        {t(field)}
                      </label>
                      <textarea
                        id={`master-${field}`}
                        dir="auto"
                        value={fields[field]}
                        onChange={(e) => setFields({ ...fields, [field]: e.target.value })}
                        maxLength={CARD_FIELD_MAX}
                        rows={2}
                        placeholder={t("undefined")}
                        className="field-sizing-content min-h-16 w-full resize-none rounded-xl border border-input bg-input/30 px-4 py-3 text-base outline-none transition-colors placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                    </motion.div>
                  ))}
                </motion.div>
              </>
            )}
            {step === "sharing" && (
              <>
                <StepTitle title={t("stepSharing")} />
                <OptionGroup legend={t("visibilityTitle")}>
                  {VISIBILITIES.map((v) => (
                    <Option key={v} checked={visibility === v} onSelect={() => setVisibility(v)} name="visibility" title={t(v)} hint={t(`${v}Hint`)} />
                  ))}
                </OptionGroup>
                <fieldset className="flex flex-col gap-2">
                  <legend className="mb-2 text-sm font-medium text-muted-foreground">{t("durationTitle")}</legend>
                  <div role="radiogroup" className="flex rounded-xl border bg-muted p-1">
                    {DURATIONS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="radio"
                        aria-checked={days === d}
                        onClick={() => setDays(d)}
                        className={cn(
                          "h-10 flex-1 rounded-lg text-sm font-medium transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                          days === d ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {d === "forever" ? t("forever") : t("days", { days: d })}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </>
            )}
            {step === "review" && (
              <>
                <StepTitle title={t("stepReview")} />
                <CardView fields={fields} />
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground">{t("visibilityTitle")}</dt>
                    <dd>{t(visibility)}</dd>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <dt className="text-muted-foreground">{t("durationTitle")}</dt>
                    <dd>{days === "forever" ? t("forever") : t("days", { days })}</dd>
                  </div>
                  {daeeName && (
                    <div className="flex flex-col gap-0.5">
                      <dt className="text-muted-foreground">{t("this_daee")}</dt>
                      <dd>{daeeName}</dd>
                    </div>
                  )}
                </dl>
                {result === "draft" && <p role="status" className="text-sm text-teal-fg">{t("draftSaved")}</p>}
                {result === "error" && <p role="alert" className="text-sm text-destructive">{t("error")}</p>}
              </>
            )}
          </motion.div>
        </div>
        <footer className="flex items-center justify-between gap-3 border-t px-5 py-4 sm:px-8">
          {index > 0 ? (
            <Button variant="ghost" size="lg" className="h-12" onClick={() => setStep(STEPS[index - 1])}>
              {t("back")}
            </Button>
          ) : (
            <span />
          )}
          {step === "review" ? (
            <div className="flex flex-1 flex-wrap justify-end gap-2">
              <Button variant="outline" size="lg" className="h-12 px-4" disabled={pending} onClick={() => submit(false)}>
                {t("saveDraft")}
              </Button>
              <Button size="lg" className="h-12 min-w-40 flex-1 px-5 sm:flex-none" disabled={pending} onClick={() => submit(true)}>
                {t("approve")}
              </Button>
            </div>
          ) : (
            <Button size="lg" className="h-12 px-6" disabled={!canContinue} onClick={() => setStep(STEPS[index + 1])}>
              {t("continue")}
            </Button>
          )}
        </footer>
      </motion.section>
    </Surface>
  );
}
