"use client";

import { useLocale, useTranslations } from "next-intl";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FormState } from "@/lib/auth/forms";
import { signInStaff } from "./actions";

export function LoginForm() {
  const t = useTranslations("Login");
  const tError = useTranslations("Errors");
  const locale = useLocale();
  const [state, formAction, pending] = useActionState<FormState, FormData>(signInStaff, {});
  const errorText = state.error ? tError(state.error) : null;
  const describedBy = errorText ? "login-error" : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="locale" value={locale} />
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-email">{t("email")}</Label>
        <Input
          id="login-email"
          name="email"
          type="email"
          dir="ltr"
          required
          autoComplete="username"
          aria-invalid={Boolean(errorText)}
          aria-describedby={describedBy}
          className="h-10"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password">{t("password")}</Label>
        <Input
          id="login-password"
          name="password"
          type="password"
          dir="ltr"
          required
          autoComplete="current-password"
          aria-invalid={Boolean(errorText)}
          aria-describedby={describedBy}
          className="h-10"
        />
      </div>
      {errorText && (
        <p id="login-error" role="alert" className="text-sm text-destructive">
          {errorText}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-10 self-start px-5">
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
