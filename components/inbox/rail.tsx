"use client";

import { Inbox as InboxIcon, LogOut } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/actions";
import type { Presence } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { PresenceDot } from "./presence-toggle";

type AccountProps = { name: string; presence?: Presence };

/** Avatar (with a presence ring for daee); opens a small menu with the name, status and sign out. */
export function AccountMenu({ name, presence, className }: AccountProps & { className?: string }) {
  const t = useTranslations("Inbox");
  const tPresence = useTranslations("Presence");
  const locale = useLocale();

  function logout() {
    const form = new FormData();
    form.set("locale", locale);
    form.set("to", "/login");
    void signOut(form);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("account")}
        className={cn("rounded-full focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", className)}
      >
        <Avatar name={name} size="sm" presence={presence} />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="inline-end" align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex flex-col gap-0.5 py-1.5">
            <span className="text-sm font-medium text-foreground">{name}</span>
            {presence && (
              <span className="flex items-center gap-1.5 text-xs font-normal">
                <PresenceDot value={presence} />
                {tPresence(presence)}
              </span>
            )}
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logout}>
          <LogOut className="rtl:-scale-x-100" aria-hidden />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function Rail({ name, presence, unread }: { name: string; presence: Presence; unread: number }) {
  const t = useTranslations("Inbox");
  return (
    <nav aria-label={t("title")} className="hidden flex-col items-center gap-2 border-e bg-sidebar py-3 md:flex">
      <Logo size={22} />
      <span
        aria-current="page"
        title={t("title")}
        className="relative mt-3 grid size-9 place-items-center rounded-lg bg-accent text-accent-foreground"
      >
        <InboxIcon className="size-4" aria-hidden />
        <span className="sr-only">{t("title")}</span>
        {unread > 0 && (
          <span
            role="status"
            aria-label={t("unread", { count: unread })}
            className="absolute -end-1.5 -top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand-violet px-1 text-[10px] font-semibold text-white tabular-nums"
          >
            {unread}
          </span>
        )}
      </span>
      <AccountMenu name={name} presence={presence} className="mt-auto" />
    </nav>
  );
}
