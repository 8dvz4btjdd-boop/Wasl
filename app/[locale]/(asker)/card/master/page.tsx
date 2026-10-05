import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAsker } from "@/lib/auth/dal";
import { CARD_COLUMNS, MASTER_SOURCE_LIMIT, type Card } from "@/lib/cards/types";
import { getDaeeName } from "@/lib/db/queries/conversations";
import { getAIEnabled } from "@/lib/db/queries/org";
import { createClient } from "@/lib/db/server";
import { MasterBuilder } from "./master-builder";

/** The asker's master card: merged from their approved session cards, then approved. */
export default async function MasterCardPage({ params }: PageProps<"/[locale]/card/master">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const asker = await requireAsker(locale);
  const supabase = await createClient();

  const [{ data: sessionRows }, { data: master }, { data: last }, aiEnabled] = await Promise.all([
    supabase
      .from("cards")
      .select(CARD_COLUMNS)
      .eq("asker_id", asker.user_id)
      .eq("scope", "session")
      .eq("status", "approved")
      .order("approved_at", { ascending: false }),
    supabase
      .from("cards")
      .select(CARD_COLUMNS)
      .eq("asker_id", asker.user_id)
      .eq("scope", "master")
      .eq("status", "approved")
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("conversations").select("id, daee_id").eq("asker_id", asker.user_id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    getAIEnabled(),
  ]);

  // The newest approved version per conversation, the latest ones first, oldest first in the list.
  const seen = new Set<string>();
  const sessions = ((sessionRows ?? []) as Card[])
    .filter((c) => (c.conversation_id && !seen.has(c.conversation_id) ? (seen.add(c.conversation_id), true) : false))
    .slice(0, MASTER_SOURCE_LIMIT)
    .reverse();
  if (sessions.length === 0) return redirect({ href: "/wait", locale });

  return (
    <MasterBuilder
      sessions={sessions}
      previous={(master as Card | null) ?? null}
      aiEnabled={aiEnabled}
      daeeName={await getDaeeName(last?.daee_id ?? null)}
      backTo={last?.id ? `/chat/${last.id}` : "/wait"}
    />
  );
}
