import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAsker } from "@/lib/auth/dal";
import { getConversation, getDaeeName, getMessages } from "@/lib/db/queries/conversations";
import { createClient } from "@/lib/db/server";
import { AskerChat, type TransferLine } from "./asker-chat";

export default async function ChatPage({ params }: PageProps<"/[locale]/chat/[id]">) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const asker = await requireAsker(locale);

  // RLS returns only the asker's own conversations; anything else goes back to /wait.
  const conversation = await getConversation(id);
  if (!conversation || conversation.asker_id !== asker.user_id) return redirect({ href: "/wait", locale });

  const supabase = await createClient();
  const [messages, daeeName, transfers, card, codes] = await Promise.all([
    getMessages(id),
    getDaeeName(conversation.daee_id),
    supabase.from("transfers").select("id, status, created_at, to_daee, requeued_at").eq("conversation_id", id).order("created_at"),
    supabase.from("cards").select("id").eq("conversation_id", id).eq("status", "approved").limit(1).maybeSingle(),
    supabase.from("askers").select("codes_revealed").eq("user_id", asker.user_id).maybeSingle(),
  ]);

  const toIds = (transfers.data ?? []).map((t) => t.to_daee);
  const { data: names } = toIds.length
    ? await supabase.from("profiles").select("user_id, display_name").in("user_id", toIds)
    : { data: [] };
  const nameOf = new Map((names ?? []).map((n) => [n.user_id, n.display_name]));
  const initialTransfers: TransferLine[] = (transfers.data ?? []).map((t) => ({
    id: t.id,
    status: t.status,
    created_at: t.created_at,
    to_name: nameOf.get(t.to_daee) ?? null,
    requeued_at: t.requeued_at,
  }));

  return (
    <AskerChat
      me={asker.user_id}
      initialConversation={conversation}
      initialDaeeName={daeeName}
      initialMessages={messages}
      initialTransfers={initialTransfers}
      initialCardApproved={Boolean(card.data)}
      codesRevealed={codes.data?.codes_revealed ?? 0}
    />
  );
}
