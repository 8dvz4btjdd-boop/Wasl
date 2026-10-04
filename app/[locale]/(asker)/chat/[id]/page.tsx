import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAsker } from "@/lib/auth/dal";
import { getConversation, getDaeeName, getMessages } from "@/lib/db/queries/conversations";
import { AskerChat } from "./asker-chat";

export default async function ChatPage({ params }: PageProps<"/[locale]/chat/[id]">) {
  const { locale: rawLocale, id } = await params;
  const locale = rawLocale as Locale;
  setRequestLocale(locale);
  const asker = await requireAsker(locale);

  // RLS returns only the asker's own conversations; anything else goes back to /wait.
  const conversation = await getConversation(id);
  if (!conversation || conversation.asker_id !== asker.user_id) return redirect({ href: "/wait", locale });

  const [messages, daeeName] = await Promise.all([getMessages(id), getDaeeName(conversation.daee_id)]);

  return (
    <AskerChat
      me={asker.user_id}
      initialConversation={conversation}
      initialDaeeName={daeeName}
      initialMessages={messages}
    />
  );
}
