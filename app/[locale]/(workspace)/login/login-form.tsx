"use client";

import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useActionState, useState } from "react";
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
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const errorText = state.error ? tError(state.error) : null;
  const describedBy = [errorText && "login-error", capsLock && "login-caps"].filter(Boolean).join(" ") || undefined;

  const trackCaps = (e: React.KeyboardEvent<HTMLInputElement>) => setCapsLock(e.getModifierState("CapsLock"));

  return (
    <form action={formAction} className="flex flex-col gap-5" noValidate={false}>
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
          aria-describedby={errorText ? "login-error" : undefined}
          className="h-10"
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="login-password">{t("password")}</Label>
        {/* The field is left-to-right in every locale; the toggle sits on its own end edge. */}
        <div className="relative" dir="ltr">
          <Input
            id="login-password"
            name="password"
            type={showPassword ? "text" : "password"}
            required
            autoComplete="current-password"
            onKeyUp={trackCaps}
            onKeyDown={trackCaps}
            onBlur={() => setCapsLock(false)}
            aria-invalid={Boolean(errorText)}
            aria-describedby={describedBy}
            className="h-10 pe-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-pressed={showPassword}
            aria-label={showPassword ? t("hidePassword") : t("showPassword")}
            title={showPassword ? t("hidePassword") : t("showPassword")}
            className="absolute inset-y-0 end-0 grid w-10 place-items-center rounded-e-lg text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {showPassword ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
          </button>
        </div>
        {capsLock && (
          <p id="login-caps" className="text-xs text-warning-fg">
            {t("capsLock")}
          </p>
        )}
      </div>
      {errorText && (
        <p id="login-error" role="alert" className="text-sm text-destructive">
          {errorText}
        </p>
      )}
      <Button type="submit" disabled={pending} className="h-10 w-full">
        {pending && <Loader2 className="animate-spin" aria-hidden />}
        {pending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
