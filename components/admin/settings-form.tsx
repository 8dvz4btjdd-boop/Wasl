"use client";

import { Check } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { languageName } from "@/components/chat/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { routing, type Locale } from "@/i18n/routing";
import { setAiEnabled, updateSettings } from "@/lib/admin/actions";
import type { OrgSettings } from "@/lib/admin/types";
import { cn } from "@/lib/utils";

export function SettingsForm({ settings }: { settings: OrgSettings }) {
  const t = useTranslations("Admin.settings");
  const locale = useLocale();
  const [name, setName] = useState(settings.name);
  const [languages, setLanguages] = useState<Locale[]>(settings.languages.filter((l): l is Locale => routing.locales.includes(l as Locale)));
  const [minutes, setMinutes] = useState(settings.wait_alert_minutes);
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [aiEnabled, setAi] = useState(settings.ai_enabled);
  const [pending, startTransition] = useTransition();
  const [aiPending, startAi] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await updateSettings({ name, languages, waitAlertMinutes: minutes });
      setStatus(result.ok ? "saved" : "error");
    });

  const toggleAi = () => {
    const next = !aiEnabled;
    setAi(next);
    startAi(async () => {
      const result = await setAiEnabled(next);
      if (!result.ok) setAi(!next);
    });
  };

  return (
    <div className="flex max-w-2xl flex-col gap-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
        onChange={() => setStatus("idle")}
        className="flex flex-col gap-6 rounded-xl border bg-card p-6"
      >
        <h2 className="text-sm font-semibold">{t("organization")}</h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-name">{t("orgName")}</Label>
          <Input id="org-name" required value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        </div>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-sm font-medium">{t("languages")}</legend>
          <div className="flex flex-wrap gap-1.5">
            {routing.locales.map((code) => {
              const selected = languages.includes(code);
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => {
                    setLanguages(selected ? languages.filter((l) => l !== code) : [...languages, code]);
                    setStatus("idle");
                  }}
                  className={cn(
                    "h-8 rounded-full border px-3 text-sm transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
                    selected ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {languageName(code, locale)}
                </button>
              );
            })}
          </div>
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="org-threshold">{t("threshold")}</Label>
          <div className="flex items-center gap-2">
            <Input
              id="org-threshold"
              type="number"
              min={1}
              max={240}
              value={minutes}
              onChange={(e) => setMinutes(Number(e.target.value))}
              aria-describedby="org-threshold-hint"
              className="h-9 w-24"
            />
            <span className="text-sm text-muted-foreground">{t("minutes")}</span>
          </div>
          <p id="org-threshold-hint" className="text-xs text-muted-foreground">
            {t("thresholdHint")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {t("save")}
          </Button>
          <span role="status" className="text-sm">
            {status === "saved" && (
              <span className="flex items-center gap-1.5 text-teal-fg">
                <Check className="size-4" aria-hidden />
                {t("saved")}
              </span>
            )}
            {status === "error" && <span className="text-destructive">{t("invalid")}</span>}
          </span>
        </div>
      </form>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="flex flex-col gap-2">
            <h2 id="ai-toggle-label" className="text-sm font-semibold">
              {t("ai")}
            </h2>
            <p id="ai-toggle-explain" className="max-w-prose text-sm text-muted-foreground">
              {t("aiExplain")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={aiEnabled}
            aria-labelledby="ai-toggle-label"
            aria-describedby="ai-toggle-explain"
            disabled={aiPending}
            onClick={toggleAi}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-60",
              aiEnabled ? "bg-teal-fg" : "bg-input",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow transition-[inset-inline-start] duration-150",
                aiEnabled ? "start-[22px]" : "start-0.5",
              )}
            />
          </button>
        </div>
        <p className="text-sm font-medium">{aiEnabled ? t("aiOn") : t("aiOff")}</p>
      </section>
    </div>
  );
}
