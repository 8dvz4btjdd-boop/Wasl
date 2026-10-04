import { useTranslations } from "next-intl";
import { Logo } from "@/components/logo";
import { SignOutButton } from "@/components/sign-out-button";
import { Surface } from "@/components/surface";
import type { StaffRole } from "@/lib/auth/dal";

type WorkspacePlaceholderProps = { name: string; role: StaffRole };

// Placeholder for /daee and /admin: proves the guards until the workspace is built.
export function WorkspacePlaceholder({ name, role }: WorkspacePlaceholderProps) {
  const t = useTranslations("Workspace");

  return (
    <Surface kind="workspace" className="flex min-h-dvh flex-1 flex-col">
      <header className="flex items-center justify-between gap-4 border-b px-6 py-3">
        <Logo size={24} wordmark />
        <SignOutButton label={t("signOut")} to="/login" />
      </header>
      <main className="flex flex-col gap-2 px-6 py-10">
        <h1 className="text-2xl font-semibold">
          {role === "admin" ? t("adminTitle") : t("daeeTitle")}
        </h1>
        <p>{t("signedInAs", { name })}</p>
        <p>{t("role", { role: t(`roles.${role}`) })}</p>
        <p className="mt-4 text-sm text-muted-foreground">{t("placeholder")}</p>
      </main>
    </Surface>
  );
}
