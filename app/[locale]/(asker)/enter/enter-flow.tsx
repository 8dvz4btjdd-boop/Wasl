"use client";

import { ArrowUp } from "lucide-react";
import { motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState, useSyncExternalStore } from "react";
import { ReturnCodeReveal } from "@/components/asker/return-code-reveal";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Link } from "@/i18n/navigation";
import { BACKGROUND_MAX, type FormError, PSEUDONYM_MAX, Pseudonym } from "@/lib/auth/forms";
import { fadeUp } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { createAsker, type EnterState } from "./actions";

type Step = "pseudonym" | "background";
const PSEUDONYM_ERRORS: FormError[] = ["pseudonymInvalid", "pseudonymTaken"];
const noopSubscribe = () => () => {};

// One question per screen, answered in a bottom composer like the chat that follows.
export function EnterFlow({ existingPseudonym }: { existingPseudonym: string | null }) {
  const t = useTranslations("Enter");
  const tError = useTranslations("Errors");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<EnterState, FormData>(createAsker, {});
  const [step, setStep] = useState<Step>("pseudonym");
  const [pseudonym, setPseudonym] = useState("");
  const [background, setBackground] = useState("");
  const [clientError, setClientError] = useState<FormError | null>(null);
  // The first step is client-only; before hydration a native submit would reload and lose input.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // A pseudonym problem found by the server sends the person back to that question.
  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state.error && PSEUDONYM_ERRORS.includes(state.error)) setStep("pseudonym");
  }

  if (state.code && state.pseudonym) {
    return <ReturnCodeReveal code={state.code} pseudonym={state.pseudonym} />;
  }

  if (existingPseudonym) {
    return (
      <div className="flex flex-1 flex-col gap-6 pt-[12vh]">
        <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">
          {t("alreadyIn", { pseudonym: existingPseudonym })}
        </h1>
        <Link href="/wait" className={cn(buttonVariants({ size: "lg" }), "h-12 self-start px-5 text-base")}>
          {t("continue")}
        </Link>
      </div>
    );
  }

  const error = clientError ?? state.error;
  const errorText = error ? tError(error) : null;

  function submitPseudonym(event: React.FormEvent) {
    event.preventDefault();
    if (!Pseudonym.safeParse(pseudonym).success) {
      setClientError("pseudonymInvalid");
      return;
    }
    setClientError(null);
    setStep("background");
  }

  const question = step === "pseudonym" ? t("pseudonymQuestion") : t("backgroundQuestion");
  const hint = step === "pseudonym" ? t("pseudonymHint") : t("backgroundHint");

  return (
    <div className="flex flex-1 flex-col">
      <motion.div
        key={step}
        variants={fadeUp}
        initial="hidden"
        animate="visible"
        className="flex flex-col gap-3 pt-[12vh]"
      >
        <h1 className="max-w-[18ch] text-4xl leading-tight font-semibold text-balance sm:text-5xl">
          {question}
        </h1>
        <p className="text-lg text-muted-foreground">{hint}</p>
      </motion.div>

      <div className="sticky bottom-0 mt-auto flex flex-col gap-3 bg-background pt-6">
        {errorText && (
          <p id="enter-error" role="alert" className="text-base text-destructive">
            {errorText}
          </p>
        )}

        {step === "pseudonym" ? (
          <form onSubmit={submitPseudonym} className="flex items-end gap-3">
            <Input
              autoFocus
              aria-label={t("pseudonymLabel")}
              placeholder={t("pseudonymLabel")}
              value={pseudonym}
              maxLength={PSEUDONYM_MAX}
              autoComplete="off"
              onChange={(e) => setPseudonym(e.target.value)}
              aria-invalid={Boolean(errorText)}
              aria-describedby={errorText ? "enter-error" : undefined}
              className="h-14 rounded-2xl px-5 text-lg md:text-lg"
            />
            <Button
              type="submit"
              disabled={!hydrated}
              aria-label={t("continue")}
              className="size-14 shrink-0 rounded-2xl"
            >
              <ArrowUp className="size-6" aria-hidden />
            </Button>
          </form>
        ) : (
          <form action={formAction} className="flex flex-col gap-3">
            <input type="hidden" name="locale" value={locale} />
            <input type="hidden" name="pseudonym" value={pseudonym} />
            <div className="flex items-end gap-3">
              <Textarea
                autoFocus
                name="background"
                aria-label={t("backgroundLabel")}
                placeholder={t("backgroundLabel")}
                value={background}
                maxLength={BACKGROUND_MAX}
                onChange={(e) => setBackground(e.target.value)}
                aria-invalid={Boolean(errorText)}
                aria-describedby={errorText ? "enter-error" : undefined}
                className="max-h-48 min-h-14 min-w-0 rounded-2xl px-5 py-4 text-lg md:text-lg"
              />
              <Button
                type="submit"
                name="skip"
                value="1"
                variant="secondary"
                disabled={pending}
                className="h-14 shrink-0 rounded-2xl px-5 text-base"
              >
                {t("skip")}
              </Button>
              <Button
                type="submit"
                disabled={pending}
                aria-label={pending ? t("creating") : t("continue")}
                className="size-14 shrink-0 rounded-2xl"
              >
                <ArrowUp className="size-6" aria-hidden />
              </Button>
            </div>
            <Button type="button" variant="ghost" className="self-start" onClick={() => setStep("pseudonym")}>
              {t("back")}
            </Button>
          </form>
        )}

        <Link href="/return" className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t("haveCode")}
        </Link>
      </div>
    </div>
  );
}
