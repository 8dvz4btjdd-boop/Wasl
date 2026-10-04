import { setRequestLocale } from "next-intl/server";
import { z } from "zod";
import { Inbox } from "@/components/inbox/inbox";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireStaff } from "@/lib/auth/dal";
import { getInbox, getMessages, getPastConversationCount, getPendingTransfer, getVisibleCards } from "@/lib/db/queries/conversations";
import { createClient } from "@/lib/db/server";

export default async function DaeePage({ params }: PageProps<"/[locale]/daee/[[...id]]">) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const staff = await requireStaff(locale, "daee");

  const selectedId = id?.[0] ?? null;
  if (id && (id.length > 1 || !z.uuid().safeParse(selectedId).success)) {
    return redirect({ href: "/daee", locale });
  }

  const supabase = await createClient();
  const [conversations, profile] = await Promise.all([
    getInbox(selectedId),
    supabase.from("profiles").select("status").eq("user_id", staff.user_id).single(),
  ]);

  // RLS only returns conversations assigned to this daee; anything else isn't theirs.
  const selected = selectedId ? conversations.find((c) => c.id === selectedId) : undefined;
  if (selectedId && !selected) return redirect({ href: "/daee", locale });
  const [messages, pastCount, cards, pendingTransfer] = selected
    ? await Promise.all([
        getMessages(selected.id),
        getPastConversationCount(selected.asker_id, selected.id),
        getVisibleCards(selected.id, selected.card_id),
        getPendingTransfer(selected.id),
      ])
    : [[], null, [], null];

  return (
    <Inbox
      me={{ id: staff.user_id, name: staff.display_name }}
      initialPresence={profile.data?.status ?? "offline"}
      conversations={conversations}
      selected={selected ?? null}
      messages={messages}
      pastCount={pastCount}
      cards={cards}
      transferPending={Boolean(pendingTransfer)}
    />
  );
}
