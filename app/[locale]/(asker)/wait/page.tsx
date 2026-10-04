import { setRequestLocale } from "next-intl/server";
import { AskerShell } from "@/components/asker/asker-shell";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAsker } from "@/lib/auth/dal";
import { getOpenConversationId } from "@/lib/db/queries/conversations";
import { QuestionForm } from "./question-form";

export default async function WaitPage({ params }: PageProps<"/[locale]/wait">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const asker = await requireAsker(locale);

  const open = await getOpenConversationId(asker.user_id);
  if (open) return redirect({ href: `/chat/${open}`, locale });

  return (
    <AskerShell>
      <QuestionForm />
    </AskerShell>
  );
}
