"use client";

import { Inbox as InboxIcon, LogOut, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Logo } from "@/components/logo";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { signOut } from "@/lib/auth/actions";
import type { Presence } from "@/lib/chat/types";
import { cn } from "@/lib/utils";
import { Avatar } from "./avatar";
import { PresenceDot, PRESENCE } from "./presence-toggle";
import { ProfileSheet } from "./profile-sheet";

type AccountProps = {
  name: string;
  /** Daee only: presence shows as a ring and in the menu, with Profile above it. */
  presence?: Presence;
  onPresence?: (value: Presence) => void;
};

/**
 * The avatar is a button: profile, presence (same choices as the 1/2/3 shortcuts) and sign
 * out. Admins get the name and sign out.
 */
export function AccountMenu({ name, presence, onPresence, className }: AccountProps & { className?: string }) {
  const t = useTranslations("Inbox");
  const tPresence = useTranslations("Presence");
  const tProfile = useTranslations("Profile");
  const locale = useLocale();
  const [profileOpen, setProfileOpen] = useState(false);

  function logout() {
    const form = new FormData();
    form.set("locale", locale);
    form.set("to", "/login");
    void signOut(form);
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          aria-label={t("account")}
          className={cn(
            "rounded-full outline-none transition-[box-shadow,transform] duration-150 hover:ring-4 hover:ring-ring/25 focus-visible:ring-4 focus-visible:ring-ring/50 active:scale-95 data-popup-open:ring-4 data-popup-open:ring-ring/35",
            className,
          )}
        >
          <Avatar name={name} size="sm" presence={presence} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="inline-end" align="end" className="w-56">
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
          {presence && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setProfileOpen(true)}>
                <UserRound aria-hidden />
                {tProfile("title")}
              </DropdownMenuItem>
              {onPresence && (
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="text-xs">{tPresence("label")}</DropdownMenuLabel>
                  <DropdownMenuRadioGroup value={presence} onValueChange={(next) => onPresence(next as Presence)}>
                    {PRESENCE.map((option, i) => (
                      <DropdownMenuRadioItem key={option} value={option}>
                        <PresenceDot value={option} />
                        {tPresence(option)}
                        <kbd className="ms-auto text-[10px] text-muted-foreground">{i + 1}</kbd>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              )}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={logout}>
            <LogOut className="rtl:-scale-x-100" aria-hidden />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {presence && <ProfileSheet open={profileOpen} onOpenChange={setProfileOpen} />}
    </>
  );
}

export function Rail({ name, presence, onPresence, unread }: { name: string; presence: Presence; onPresence: (value: Presence) => void; unread: number }) {
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
      <AccountMenu name={name} presence={presence} onPresence={onPresence} className="mt-auto" />
    </nav>
  );
}
