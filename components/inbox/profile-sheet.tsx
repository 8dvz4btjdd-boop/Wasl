"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, type ReactNode } from "react";
import { languageName } from "@/components/chat/format";
import { getMyProfile, type MyProfile } from "@/lib/inbox/actions";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { PresenceDot } from "./presence-toggle";

/** The daee's own profile in a side sheet (end side). Read-only: the admin edits it. */
export function ProfileSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("Profile");
  const tPresence = useTranslations("Presence");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    getMyProfile()
      .then((p) => {
        if (!active) return;
        setProfile(p);
        setFailed(!p);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
    };
  }, [open]);

  const number = new Intl.NumberFormat(locale);
  const seconds = profile?.medianFirstReplySeconds;
  const median =
    seconds == null
      ? null
      : seconds < 60
        ? new Intl.NumberFormat(locale, { style: "unit", unit: "second", unitDisplay: "short" }).format(seconds)
        : new Intl.NumberFormat(locale, { style: "unit", unit: "minute", unitDisplay: "short" }).format(Math.round(seconds / 60));

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/20 transition-opacity duration-200 data-[ending-style]:opacity-0 data-[starting-style]:opacity-0" />
        <Dialog.Popup
          data-surface="workspace"
          data-theme="light"
          className={cn(
            "fixed inset-y-0 end-0 z-50 flex w-full max-w-sm flex-col border-s bg-card text-foreground shadow-xl outline-none",
            "transition-[translate,opacity] duration-200 ease-out data-[ending-style]:opacity-0 data-[starting-style]:opacity-0",
            "data-[ending-style]:translate-x-4 data-[starting-style]:translate-x-4 rtl:data-[ending-style]:-translate-x-4 rtl:data-[starting-style]:-translate-x-4",
          )}
        >
          <header className="flex items-center justify-between border-b px-5 py-4">
            <Dialog.Title className="text-sm font-semibold">{t("title")}</Dialog.Title>
            <Dialog.Close
              aria-label={t("close")}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <X className="size-4" aria-hidden />
            </Dialog.Close>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {failed ? (
              <p className="text-sm text-muted-foreground">{t("error")}</p>
            ) : !profile ? (
              <div aria-busy className="flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-4 animate-pulse rounded bg-muted motion-reduce:animate-none" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                <div className="flex items-center gap-3">
                  <Avatar name={profile.name} presence={profile.status} />
                  <div className="flex min-w-0 flex-col">
                    <p className="truncate font-semibold">{profile.name}</p>
                    {profile.email && (
                      <p dir="ltr" className="truncate text-start text-sm text-muted-foreground">
                        {profile.email}
                      </p>
                    )}
                  </div>
                </div>

                <section aria-labelledby="profile-today" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border bg-border">
                  <h3 id="profile-today" className="sr-only">
                    {t("today")}
                  </h3>
                  <Stat label={t("handledToday")} value={number.format(profile.handledToday)} />
                  <Stat label={t("medianFirstReply")} value={median ?? "–"} />
                </section>

                <dl className="flex flex-col gap-4 text-sm">
                  <Field label={t("status")}>
                    <span className="flex items-center gap-1.5">
                      <PresenceDot value={profile.status} />
                      {tPresence(profile.status)}
                    </span>
                  </Field>
                  <Field label={t("languages")}>
                    <Chips items={profile.languages.map((l) => languageName(l, locale))} />
                  </Field>
                  <Field label={t("topics")}>
                    {profile.topics.length ? <Chips items={profile.topics.map((x) => tTopic(x as never))} /> : "–"}
                  </Field>
                  <Field label={t("capacity")}>{t("capacityValue", { count: profile.capacity })}</Field>
                </dl>

                <p className="border-t pt-4 text-xs text-muted-foreground">{t("adminEdits")}</p>
              </div>
            )}
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 bg-card px-4 py-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5">
      {items.map((item) => (
        <li key={item} className="rounded-full bg-muted px-2 text-xs leading-6">
          {item}
        </li>
      ))}
    </ul>
  );
}
