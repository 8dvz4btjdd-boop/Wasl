"use client";

import { Check, Trash2, X } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState, useTransition } from "react";
import { CardView } from "@/components/cards/card-view";
import { useAITask } from "@/lib/ai/useAITask";
import { AIDraft, type AIDraftData } from "./ai-draft";
import { useHydrated } from "@/components/chat/use-clock";
import { Surface } from "@/components/surface";
import { Button, buttonVariants } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { deleteCard, submitCard } from "@/lib/cards/actions";
import { isolate } from "@/lib/bidi";
import {
  CARD_FIELD_MAX,
  CARD_FIELDS,
  DURATIONS,
  isUndefinedField,
  UNDEFINED_FIELD,
  VISIBILITIES,
  type Card,
  type CardField,
  type Duration,
  type Visibility,
} from "@/lib/cards/types";
import type { MessageRow } from "@/lib/chat/types";
import { fadeUp, sheetIn, staggerChildren } from "@/lib/motion";
import { cn } from "@/lib/utils";

type Step = "select" | "fields" | "sharing" | "review";
const STEPS: Step[] = ["select", "fields", "sharing", "review"];
/** The model reads at most this many messages: the latest ones of the selection. */
const AI_MESSAGE_LIMIT = 60;
const LONG_MESSAGE = 280;

type CardBuilderProps = {
  conversationId: string;
  messages: MessageRow[];
  me: string;
  daeeName: string | null;
  latest: Card | null;
  /** The latest version is approved and not yet expired (decided on the server). */
  latestActive: boolean;
  transferPending: boolean;
  /** The organization's AI switch: off means no choice, the manual form directly. */
  aiEnabled: boolean;
};

const emptyFields = (): Record<CardField, string> => ({ follow_up: "", covered: "", remaining: "", next_step: "" });

/** One step at a time on a bottom sheet; nothing is shared until "Approve and share". */
export function CardBuilder({ conversationId, messages, me, daeeName, latest, latestActive, transferPending, aiEnabled }: CardBuilderProps) {
  const t = useTranslations("Card");
  const locale = useLocale();
  const hydrated = useHydrated();
  const [editing, setEditing] = useState(!latestActive);
  const [step, setStep] = useState<Step>("select");
  const [selected, setSelected] = useState<Set<string>>(() => new Set(latest?.source_message_ids ?? messages.map((m) => m.id)));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [fields, setFields] = useState<Record<CardField, string>>(() => {
    const base = emptyFields();
    if (!latest) return base;
    for (const f of CARD_FIELDS) base[f] = isUndefinedField(latest[f]) ? "" : (latest[f] ?? "");
    return base;
  });
  const [acceptSubstitute, setAcceptSubstitute] = useState(latest?.accept_substitute ?? true);
  // A daee asked for a card before handing over: the next daee is the natural audience.
  const [visibility, setVisibility] = useState<Visibility>(latest?.visibility ?? (transferPending ? "next_daee" : "this_daee"));
  const [days, setDays] = useState<Duration>("forever");
  const [result, setResult] = useState<"approved" | "draft" | "error" | null>(null);
  const [approvedUntil, setApprovedUntil] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  const chosen = useMemo(() => messages.filter((m) => selected.has(m.id)), [messages, selected]);
  const index = STEPS.indexOf(step);

  // AI draft: generated from the selected messages only; nothing is saved or shared until
  // the asker continues, edits and approves. Any failure falls back to the manual form.
  const [mode, setMode] = useState<"manual" | "ai">("manual");
  const ai = useAITask<AIDraftData>("/api/ai/card");
  const [generated, setGenerated] = useState<Record<CardField, string> | null>(null);
  const [aiUnavailable, setAIUnavailable] = useState(false);
  // React to the run's end during render (not in an effect): fill the fields, or fall back.
  const [seenAI, setSeenAI] = useState(ai.state);
  if (seenAI !== ai.state) {
    setSeenAI(ai.state);
    // Ignore a draft that arrives after the asker chose to write from scratch.
    if (ai.state === "done" && ai.data && mode === "ai") {
      const texts = Object.fromEntries(
        CARD_FIELDS.map((f) => [f, ai.data![f].text === UNDEFINED_FIELD ? "" : (ai.data![f].text ?? "")]),
      ) as Record<CardField, string>;
      setGenerated(texts);
      setFields(texts);
    }
    if (ai.state === "fallback" && mode === "ai") {
      setMode("manual");
      setAIUnavailable(true);
    }
  }

  // The latest messages of the selection, up to the model's limit, in conversation order.
  const chosenAll = useMemo(() => messages.filter((m) => selected.has(m.id)), [messages, selected]);
  const sent = useMemo(() => new Set(chosenAll.slice(-AI_MESSAGE_LIMIT).map((m) => m.id)), [chosenAll]);

  // After selection the AI draft is the default (when the organization has AI on).
  function next() {
    if (step === "select") {
      setStep("fields");
      if (aiEnabled) {
        setMode("ai");
        setAIUnavailable(false);
        setGenerated(null);
        void ai.run({ conversationId, messageIds: [...sent], locale });
      } else {
        setMode("manual");
      }
      return;
    }
    setStep(STEPS[index + 1]);
  }
  function writeFromScratch() {
    setMode("manual");
    setGenerated(null);
    setFields(emptyFields());
  }

  const submit = (approve: boolean) =>
    startTransition(async () => {
      const res = await submitCard({
        conversationId,
        sourceMessageIds: [...selected],
        fields,
        acceptSubstitute,
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
      if (!res.ok) return setResult("error");
      setResult(approve ? "approved" : "draft");
      if (approve) setApprovedUntil(days === "forever" ? null : new Date(Date.now() + days * 864e5).toISOString());
    });

  const header = (
    <header className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 px-4 pt-4 sm:px-6">
      <h1 className="text-lg font-semibold">{t("title")}</h1>
      <Link
        href={`/chat/${conversationId}`}
        aria-label={t("backToChat")}
        className="grid size-9 place-items-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <X className="size-5" aria-hidden />
      </Link>
    </header>
  );

  // Approved and unexpired: read-only, with the option to start a new version.
  if (!editing || result === "approved") {
    const card = result === "approved" ? null : latest;
    const until = result === "approved" ? approvedUntil : card?.expires_at;
    return (
      <Surface kind="asker" className="flex min-h-dvh flex-col">
        {header}
        <motion.main variants={sheetIn} initial="hidden" animate="visible" className="mx-auto mt-6 flex w-full max-w-2xl flex-1 flex-col gap-6 rounded-t-3xl border-x border-t bg-card px-5 py-6 sm:px-8">
          <p className="flex items-center gap-2 text-sm font-medium text-teal-fg">
            <Check className="size-4" aria-hidden />
            {until ? (hydrated ? t("approved", { date: date(until) }) : null) : t("approvedForever")}
          </p>
          <CardView fields={card ?? fields} />
          <SharingSummary daeeName={daeeName} acceptSubstitute={card?.accept_substitute ?? acceptSubstitute} visibility={card?.visibility ?? visibility} />
          <div className="mt-auto flex flex-col gap-3 pt-4 sm:flex-row">
            <Link href={`/chat/${conversationId}`} className={cn(buttonVariants({ size: "lg" }), "h-12 px-5 text-base")}>
              {t("backToChat")}
            </Link>
            <Button
              variant="outline"
              size="lg"
              className="h-12 px-5 text-base"
              onClick={() => {
                setEditing(true);
                setResult(null);
                setStep("select");
              }}
            >
              {t("newVersion")}
            </Button>
            <DeleteCard conversationId={conversationId} />
          </div>
        </motion.main>
      </Surface>
    );
  }

  const canContinue = step === "select" ? selected.size > 0 : step === "fields" && mode === "ai" ? ai.state === "done" : true;

  return (
    <Surface kind="asker" className="flex h-dvh flex-col">
      {header}
      {/* Progress: a thin line, not numbered markers. */}
      <div className="mx-auto mt-4 flex w-full max-w-2xl gap-1.5 px-4 sm:px-6" aria-hidden>
        {STEPS.map((s, i) => (
          <span key={s} className={cn("h-1 flex-1 rounded-full transition-colors duration-200", i <= index ? "bg-brand-teal" : "bg-muted")} />
        ))}
      </div>

      <motion.section
        variants={sheetIn}
        initial="hidden"
        animate="visible"
        className="mx-auto mt-4 flex min-h-0 w-full max-w-2xl flex-1 flex-col rounded-t-3xl border-x border-t bg-card"
      >
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-6 sm:px-8">
          <motion.div key={step} variants={fadeUp} initial="hidden" animate="visible" className="flex flex-col gap-6">
            {step === "select" && (
              <>
                <StepTitle title={t("stepSelect")} hint={t("stepSelectHint")} />
                {messages.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => setSelected(new Set(messages.map((m) => m.id)))}>
                      {t("selectAll")}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
                      {t("selectNone")}
                    </Button>
                    {aiEnabled && chosenAll.length > AI_MESSAGE_LIMIT && (
                      <p className="text-sm text-muted-foreground">{t("aiLatestOnly", { count: AI_MESSAGE_LIMIT })}</p>
                    )}
                  </div>
                )}
                {messages.length === 0 ? (
                  <p className="text-muted-foreground">{t("noMessages")}</p>
                ) : (
                  <ul className="flex flex-col gap-2">
                    {messages.map((m) => {
                      const checked = selected.has(m.id);
                      const mine = m.sender_id === me;
                      return (
                        <li key={m.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors duration-150 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
                              checked ? "border-brand-teal/70 bg-teal-bg" : "hover:bg-muted/60",
                            )}
                          >
                            <input
                              type="checkbox"
                              className="sr-only"
                              checked={checked}
                              onChange={() => {
                                const next = new Set(selected);
                                if (checked) next.delete(m.id);
                                else next.add(m.id);
                                setSelected(next);
                              }}
                            />
                            <span
                              aria-hidden
                              className={cn(
                                "mt-0.5 grid size-6 shrink-0 place-items-center rounded-md border-2 transition-colors duration-150",
                                checked ? "border-brand-teal bg-brand-teal text-brand-navy" : "border-input",
                              )}
                            >
                              {checked && <Check className="size-4" strokeWidth={3} />}
                            </span>
                            <span
                              className={cn(
                                "flex min-w-0 flex-1 flex-col items-start gap-1 rounded-xl px-3 py-2",
                                mine ? "bg-brand-violet/25" : "bg-muted",
                              )}
                            >
                              <span
                                dir="auto"
                                className={cn(
                                  "w-full whitespace-pre-wrap break-words",
                                  m.body.length > LONG_MESSAGE && !expanded.has(m.id) && "line-clamp-4",
                                )}
                              >
                                {m.body}
                              </span>
                              {m.body.length > LONG_MESSAGE && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    // Inside the label: show more without toggling the selection.
                                    e.preventDefault();
                                    e.stopPropagation();
                                    const next = new Set(expanded);
                                    if (next.has(m.id)) next.delete(m.id);
                                    else next.add(m.id);
                                    setExpanded(next);
                                  }}
                                  className="text-xs font-medium text-teal-fg underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                                >
                                  {expanded.has(m.id) ? t("showLess") : t("showMore")}
                                </button>
                              )}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </>
            )}

            {step === "fields" && mode === "ai" && (
              <>
                <StepTitle title={t("stepFields")} />
                <AIDraft
                  messages={messages}
                  me={me}
                  selected={sent}
                  totalSelected={chosenAll.length}
                  state={ai.state}
                  meta={ai.meta}
                  draft={ai.state === "done" ? ai.data : (ai.partial as Partial<AIDraftData> | null)}
                  generated={generated}
                  fields={fields}
                  onChange={(field, value) => setFields({ ...fields, [field]: value })}
                />
                <button
                  type="button"
                  onClick={writeFromScratch}
                  className="self-start text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {t("writeFromScratch")}
                </button>
              </>
            )}

            {step === "fields" && mode === "manual" && (
              <>
                {aiUnavailable && (
                  <p role="status" className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground">
                    {t("aiUnavailable")}
                  </p>
                )}
                <StepTitle title={t("stepFields")} hint={t("emptyNote")} />
                <motion.div variants={staggerChildren(0.06)} initial="hidden" animate="visible" className="flex flex-col gap-5">
                  {CARD_FIELDS.map((field) => (
                    <motion.div key={field} variants={fadeUp} className="flex flex-col gap-1.5">
                      <label htmlFor={`card-${field}`} className="font-medium">
                        {t(field)}
                      </label>
                      <span id={`card-${field}-hint`} className="text-sm text-muted-foreground">
                        {t(`${field}Hint`)}
                      </span>
                      <textarea
                        id={`card-${field}`}
                        value={fields[field]}
                        onChange={(e) => setFields({ ...fields, [field]: e.target.value })}
                        maxLength={CARD_FIELD_MAX}
                        rows={2}
                        aria-describedby={`card-${field}-hint`}
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
                <OptionGroup legend={t("preferredTitle")}>
                  <Option checked={!acceptSubstitute} onSelect={() => setAcceptSubstitute(false)} name="preferred"
                    title={daeeName ? t("preferSame", { name: isolate(daeeName) }) : t("preferSameAnyone")} />
                  <Option checked={acceptSubstitute} onSelect={() => setAcceptSubstitute(true)} name="preferred"
                    title={daeeName ? t("preferSubstitute", { name: isolate(daeeName) }) : t("preferSubstituteAnyone")} />
                </OptionGroup>
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
                <div className="rounded-2xl border bg-background/40 p-5">
                  <CardView fields={fields} />
                </div>
                <details className="group rounded-2xl border px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-muted-foreground">{t("sources", { count: chosen.length })}</summary>
                  <ul className="mt-3 flex flex-col gap-2">
                    {chosen.map((m) => (
                      <li key={m.id} dir="auto" className="border-s-2 border-brand-teal/60 ps-3 text-sm whitespace-pre-wrap text-muted-foreground">
                        {m.body}
                      </li>
                    ))}
                  </ul>
                </details>
                <SharingSummary daeeName={daeeName} acceptSubstitute={acceptSubstitute} visibility={visibility} days={days} />
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
            <span className="text-sm text-muted-foreground" aria-live="polite">
              {t("selectedCount", { count: selected.size })}
            </span>
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
            <Button size="lg" className="h-12 px-6" disabled={!canContinue} onClick={next}>
              {t("continue")}
            </Button>
          )}
        </footer>
      </motion.section>
    </Surface>
  );
}

function StepTitle({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-2xl leading-snug font-semibold text-balance sm:text-3xl">{title}</h2>
      {hint && <p className="text-muted-foreground">{hint}</p>}
    </div>
  );
}

function OptionGroup({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-muted-foreground">{legend}</legend>
      {children}
    </fieldset>
  );
}

function Option({ checked, onSelect, name, title, hint }: { checked: boolean; onSelect: () => void; name: string; title: string; hint?: string }) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors duration-150 has-focus-visible:ring-3 has-focus-visible:ring-ring/50",
        checked ? "border-brand-teal/70 bg-teal-bg" : "hover:bg-muted/60",
      )}
    >
      <input type="radio" name={name} checked={checked} onChange={onSelect} className="sr-only" />
      <span aria-hidden className={cn("mt-0.5 grid size-5 shrink-0 place-items-center rounded-full border-2", checked ? "border-brand-teal" : "border-input")}>
        {checked && <span className="size-2.5 rounded-full bg-brand-teal" />}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="font-medium">{title}</span>
        {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
      </span>
    </label>
  );
}

function SharingSummary({ daeeName, acceptSubstitute, visibility, days }: { daeeName: string | null; acceptSubstitute: boolean; visibility: Visibility; days?: Duration }) {
  const t = useTranslations("Card");
  const rows = [
    { label: t("preferredTitle"), value: acceptSubstitute ? (daeeName ? t("preferSubstitute", { name: isolate(daeeName) }) : t("preferSubstituteAnyone")) : daeeName ? t("preferSame", { name: isolate(daeeName) }) : t("preferSameAnyone") },
    { label: t("visibilityTitle"), value: t(visibility) },
    ...(days ? [{ label: t("durationTitle"), value: days === "forever" ? t("forever") : t("days", { days }) }] : []),
  ];
  return (
    <dl className="flex flex-col gap-3 text-sm">
      {rows.map((r) => (
        <div key={r.label} className="flex flex-col gap-0.5">
          <dt className="text-muted-foreground">{r.label}</dt>
          <dd>{r.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Two taps: delete, then confirm. Every version goes, and with it every daee's access. */
function DeleteCard({ conversationId }: { conversationId: string }) {
  const t = useTranslations("Card");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [failed, setFailed] = useState(false);
  const [pending, startTransition] = useTransition();
  if (!confirming) {
    return (
      <Button variant="ghost" size="lg" className="h-12 px-4 text-base text-muted-foreground sm:ms-auto" onClick={() => setConfirming(true)}>
        <Trash2 aria-hidden />
        {t("delete")}
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 sm:ms-auto sm:items-end">
      <p className="text-sm text-muted-foreground">{failed ? t("error") : t("deleteHint")}</p>
      <div className="flex gap-2">
        <Button variant="outline" size="lg" className="h-12 px-4" onClick={() => setConfirming(false)}>
          {t("back")}
        </Button>
        <Button
          variant="destructive"
          size="lg"
          className="h-12 px-4"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await deleteCard(conversationId);
              if (!res.ok) return setFailed(true);
              router.replace(`/chat/${conversationId}`);
              router.refresh();
            })
          }
        >
          {t("confirmDelete")}
        </Button>
      </div>
    </div>
  );
}

