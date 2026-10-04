"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link } from "@/i18n/navigation";
import { type FormState, PSEUDONYM_MAX } from "@/lib/auth/forms";
import { returnAsker } from "./actions";

export function ReturnForm() {
  const t = useTranslations("Return");
  const tError = useTranslations("Errors");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<FormState, FormData>(returnAsker, {});
  const errorText = state.error ? tError(state.error, { minutes: state.minutes ?? 0 }) : null;
  const describedBy = errorText ? "return-error" : undefined;

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex animate-fade-up flex-col gap-3 pt-[12vh]">
        <h1 className="text-4xl leading-tight font-semibold sm:text-5xl">{t("title")}</h1>
        <p className="text-lg text-muted-foreground">{t("hint")}</p>
      </div>

      <form action={formAction} className="sticky bottom-0 mt-auto flex flex-col gap-4 bg-background pt-6">
        <input type="hidden" name="locale" value={locale} />
        {errorText && (
          <p id="return-error" role="alert" className="text-base text-destructive">
            {errorText}
          </p>
        )}
        <div className="flex flex-col gap-2">
          <Label htmlFor="return-pseudonym" className="text-base">
            {t("pseudonymLabel")}
          </Label>
          <Input
            id="return-pseudonym"
            name="pseudonym"
            required
            autoComplete="off"
            maxLength={PSEUDONYM_MAX}
            aria-invalid={Boolean(errorText)}
            aria-describedby={describedBy}
            className="h-14 rounded-2xl px-5 text-lg md:text-lg"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="return-code" className="text-base">
            {t("codeLabel")}
          </Label>
          <Input
            id="return-code"
            name="code"
            required
            dir="ltr"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="XXXX-XXXX-XX"
            maxLength={32}
            aria-invalid={Boolean(errorText)}
            aria-describedby={describedBy}
            className="h-14 rounded-2xl px-5 text-lg tracking-[0.08em] tabular-nums md:text-lg"
          />
        </div>
        <Button type="submit" disabled={pending} className="h-14 rounded-2xl text-lg">
          {pending ? t("submitting") : t("submit")}
        </Button>
        <Link href="/enter" className="self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t("newHere")}
        </Link>
      </form>
    </div>
  );
}
