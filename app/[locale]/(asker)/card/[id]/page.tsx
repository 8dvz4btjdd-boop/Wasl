import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAsker } from "@/lib/auth/dal";
import { CARD_COLUMNS, type Card } from "@/lib/cards/types";
import { getConversation, getDaeeName, getMessages } from "@/lib/db/queries/conversations";
import { createClient } from "@/lib/db/server";
import { CardBuilder } from "./card-builder";

// The asker's card for one conversation (id = conversation id).
export default async function CardPage({ params }: PageProps<"/[locale]/card/[id]">) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const asker = await requireAsker(locale);

  const conversation = await getConversation(id);
  if (!conversation || conversation.asker_id !== asker.user_id) return redirect({ href: "/wait", locale });

  const supabase = await createClient();
  const [messages, daeeName, latest, pending] = await Promise.all([
    getMessages(id),
    getDaeeName(conversation.daee_id),
    supabase.from("cards").select(CARD_COLUMNS).eq("conversation_id", id).order("version", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("transfers").select("id").eq("conversation_id", id).eq("status", "pending").maybeSingle(),
  ]);

  return (
    <CardBuilder
      conversationId={id}
      messages={messages}
      me={asker.user_id}
      daeeName={daeeName}
      latest={(latest.data as Card | null) ?? null}
      latestActive={isActive(latest.data as Card | null)}
      transferPending={Boolean(pending.data)}
    />
  );
}

function isActive(card: Card | null) {
  return card?.status === "approved" && (!card.expires_at || Date.parse(card.expires_at) > Date.now());
}
