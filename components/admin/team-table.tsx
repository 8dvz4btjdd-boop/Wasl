"use client";

import { Check, Copy, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { languageName } from "@/components/chat/format";
import { Avatar } from "@/components/inbox/avatar";
import { PresenceDot } from "@/components/inbox/presence-toggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRouter } from "@/i18n/navigation";
import { routing, type Locale } from "@/i18n/routing";
import { createDaee, setDaeeActive, updateDaee } from "@/lib/admin/actions";
import type { TeamMember } from "@/lib/admin/types";
import { TOPICS, type Topic } from "@/lib/chat/types";
import { subscribeResilient } from "@/lib/db/client";
import { cn } from "@/lib/utils";

type Draft = { languages: Locale[]; topics: Topic[]; capacity: number };

export function TeamTable({ team }: { team: TeamMember[] }) {
  const t = useTranslations("Admin.team");
  const tPresence = useTranslations("Presence");
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  // Presence and load are live: any profile or conversation change re-reads the table.
  useEffect(
    () =>
      subscribeResilient({
        name: "admin-team",
        configure: (channel) =>
          channel
            .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => router.refresh())
            .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => router.refresh()),
        onResync: () => router.refresh(),
      }),
    [router],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus aria-hidden />
            {t("add")}
          </Button>
        )}
      </div>
      {adding && <AddDaee onClose={() => setAdding(false)} />}

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b text-xs text-muted-foreground">
            <tr className="[&>th]:px-4 [&>th]:py-2.5 [&>th]:text-start [&>th]:font-medium">
              <th>{t("name")}</th>
              <th>{t("languages")}</th>
              <th>{t("topics")}</th>
              <th>{t("status")}</th>
              <th>{t("load")}</th>
              <th>
                <span className="sr-only">{t("actions")}</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {team.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  {t("empty")}
                </td>
              </tr>
            )}
            {team.map((m) =>
              editing === m.user_id ? (
                <EditRow key={m.user_id} member={m} onDone={() => setEditing(null)} />
              ) : (
                <tr key={m.user_id} className={cn("align-middle [&>td]:px-4 [&>td]:py-3", !m.active && "text-muted-foreground")}>
                  <td>
                    <div className="flex items-center gap-3">
                      <Avatar name={m.display_name} size="sm" />
                      <div className="flex min-w-0 flex-col">
                        <span className="flex items-center gap-2 font-medium text-foreground">
                          {m.display_name}
                          {!m.active && (
                            <span className="rounded-full bg-muted px-2 text-[11px] leading-5 font-normal text-muted-foreground">
                              {t("deactivated")}
                            </span>
                          )}
                        </span>
                        <span className="truncate text-xs text-muted-foreground" dir="ltr">
                          {m.email}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Codes values={m.languages} />
                  </td>
                  <td>
                    <TopicChips values={m.topics} />
                  </td>
                  <td>
                    <span className="flex items-center gap-1.5 whitespace-nowrap">
                      <PresenceDot value={m.active ? m.status : "offline"} />
                      {tPresence(m.active ? m.status : "offline")}
                    </span>
                  </td>
                  <td>
                    <LoadBar open={m.open} capacity={m.capacity} />
                  </td>
                  <td className="text-end">
                    <RowActions member={m} onEdit={() => setEditing(m.user_id)} />
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Codes({ values }: { values: string[] }) {
  const locale = useLocale();
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((code) => (
        <span key={code} title={languageName(code, locale)} className="rounded border px-1.5 text-[11px] leading-5 uppercase">
          {code}
        </span>
      ))}
    </span>
  );
}

function TopicChips({ values }: { values: string[] }) {
  const tTopic = useTranslations("Topics");
  return (
    <span className="flex flex-wrap gap-1">
      {values.map((topic) => (
        <span key={topic} className="rounded-full bg-muted px-2 text-[11px] leading-5 text-muted-foreground">
          {tTopic(topic as never)}
        </span>
      ))}
    </span>
  );
}

function LoadBar({ open, capacity }: { open: number; capacity: number }) {
  const t = useTranslations("Admin.team");
  const ratio = capacity > 0 ? Math.min(1, open / capacity) : 0;
  return (
    <div className="flex min-w-28 items-center gap-2">
      <div
        role="meter"
        aria-valuemin={0}
        aria-valuemax={capacity}
        aria-valuenow={open}
        aria-label={t("loadValue", { open, capacity })}
        className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div className={cn("h-full rounded-full", ratio >= 1 ? "bg-warning-fg" : "bg-teal-fg")} style={{ width: `${ratio * 100}%` }} />
      </div>
      <span className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">{t("loadValue", { open, capacity })}</span>
    </div>
  );
}

function RowActions({ member, onEdit }: { member: TeamMember; onEdit: () => void }) {
  const t = useTranslations("Admin.team");
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const toggle = (active: boolean) =>
    startTransition(async () => {
      const result = await setDaeeActive({ userId: member.user_id, active });
      if (result.ok) {
        setConfirming(false);
        router.refresh();
      }
    });

  if (!member.active) {
    return (
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => toggle(true)}>
        {t("reactivate")}
      </Button>
    );
  }
  return confirming ? (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="destructive" disabled={pending} onClick={() => toggle(false)} autoFocus>
        {t("confirmDeactivate")}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
        {t("cancel")}
      </Button>
    </span>
  ) : (
    <span className="inline-flex gap-1">
      <Button size="sm" variant="ghost" onClick={onEdit}>
        {t("edit")}
      </Button>
      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setConfirming(true)}>
        {t("deactivate")}
      </Button>
    </span>
  );
}

function DaeeFields({ draft, onChange }: { draft: Draft; onChange: (draft: Draft) => void }) {
  const t = useTranslations("Admin.team");
  const tTopic = useTranslations("Topics");
  const locale = useLocale();
  const toggle = <T,>(list: T[], value: T) => (list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  return (
    <>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("languages")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {routing.locales.map((code) => (
            <Chip key={code} selected={draft.languages.includes(code)} onClick={() => onChange({ ...draft, languages: toggle(draft.languages, code) })}>
              {languageName(code, locale)}
            </Chip>
          ))}
        </div>
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium text-muted-foreground">{t("topics")}</legend>
        <div className="flex flex-wrap gap-1.5">
          {TOPICS.map((topic) => (
            <Chip key={topic} selected={draft.topics.includes(topic)} onClick={() => onChange({ ...draft, topics: toggle(draft.topics, topic) })}>
              {tTopic(topic)}
            </Chip>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="daee-capacity" className="text-xs text-muted-foreground">
          {t("capacity")}
        </Label>
        <Input
          id="daee-capacity"
          type="number"
          min={1}
          max={20}
          value={draft.capacity}
          onChange={(e) => onChange({ ...draft, capacity: Number(e.target.value) })}
          className="h-9 w-24"
        />
      </div>
    </>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        "h-7 rounded-full border px-3 text-xs transition-colors duration-150 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        selected ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function EditRow({ member, onDone }: { member: TeamMember; onDone: () => void }) {
  const t = useTranslations("Admin.team");
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({
    languages: member.languages.filter((l): l is Locale => routing.locales.includes(l as Locale)),
    topics: member.topics.filter((x): x is Topic => (TOPICS as readonly string[]).includes(x)),
    capacity: member.capacity,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const save = () =>
    startTransition(async () => {
      const result = await updateDaee({ userId: member.user_id, ...draft });
      if (result.ok) {
        router.refresh();
        onDone();
      } else setError(t("invalid"));
    });

  return (
    <tr className="bg-muted/40">
      <td colSpan={6} className="px-4 py-4">
        <div className="flex flex-col gap-4">
          <p className="font-medium">{member.display_name}</p>
          <DaeeFields draft={draft} onChange={setDraft} />
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex gap-2">
            <Button size="sm" disabled={pending} onClick={save}>
              {t("save")}
            </Button>
            <Button size="sm" variant="ghost" onClick={onDone}>
              {t("cancel")}
            </Button>
          </div>
        </div>
      </td>
    </tr>
  );
}

function AddDaee({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Admin.team");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [draft, setDraft] = useState<Draft>({ languages: [], topics: [], capacity: 3 });
  const [error, setError] = useState<string | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  const create = () =>
    startTransition(async () => {
      const result = await createDaee({ email, displayName: name, ...draft });
      if (result.ok) {
        setPassword(result.password);
        router.refresh();
      } else setError(result.error === "emailTaken" ? t("emailTaken") : t("invalid"));
    });

  if (password) {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <p className="text-sm font-medium">{t("tempPassword")}</p>
        <div className="flex items-center gap-2">
          <code dir="ltr" className="rounded-lg border bg-muted px-3 py-2 text-base tracking-wide select-all">
            {password}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(password);
                setCopied(true);
              } catch {}
            }}
          >
            {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("tempPasswordHint")}</p>
        <div>
          <Button size="sm" onClick={onClose}>
            {t("done")}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
      className="flex flex-col gap-4 rounded-xl border bg-card p-5"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="daee-name" className="text-xs text-muted-foreground">
            {t("name")}
          </Label>
          <Input id="daee-name" required value={name} onChange={(e) => setName(e.target.value)} className="h-9" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="daee-email" className="text-xs text-muted-foreground">
            {t("email")}
          </Label>
          <Input id="daee-email" type="email" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
        </div>
      </div>
      <DaeeFields draft={draft} onChange={setDraft} />
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {t("create")}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onClose}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
