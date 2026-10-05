import { setRequestLocale } from "next-intl/server";
import { AskerShell } from "@/components/asker/asker-shell";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { requireAsker } from "@/lib/auth/dal";
import { getOpenConversationId } from "@/lib/db/queries/conversations";
import { createClient } from "@/lib/db/server";
import { QuestionForm, type ResumeInfo } from "./question-form";

export default async function WaitPage({ params }: PageProps<"/[locale]/wait">) {
  const locale = (await params).locale as Locale;
  setRequestLocale(locale);
  const asker = await requireAsker(locale);

  const open = await getOpenConversationId(asker.user_id);
  if (open) return redirect({ href: `/chat/${open}`, locale });

  return (
    <AskerShell>
      <QuestionForm resume={await getResumeInfo(asker.user_id)} />
    </AskerShell>
  );
}

/** Returning askers: their latest approved card, and who it prefers (presence, next slot). */
async function getResumeInfo(askerId: string): Promise<ResumeInfo | null> {
  const supabase = await createClient();
  const { data: previous } = await supabase
    .from("conversations")
    .select("id")
    .eq("asker_id", askerId)
    .eq("status", "ended")
    .limit(1)
    .maybeSingle();
  if (!previous) return null;

  const { data: card } = await supabase
    .from("cards")
    .select("follow_up, next_step, preferred_daee, accept_substitute")
    .eq("asker_id", askerId)
    .eq("status", "approved")
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order("scope", { ascending: true })
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!card) return { card: null, preferred: null };

  let preferred: ResumeInfo["preferred"] = null;
  if (card.preferred_daee) {
    const [profile, slot] = await Promise.all([
      supabase.from("profiles").select("display_name, status").eq("user_id", card.preferred_daee).maybeSingle(),
      supabase
        .from("availability")
        .select("slot_at")
        .eq("daee_id", card.preferred_daee)
        .eq("booked", false)
        .gt("slot_at", new Date().toISOString())
        .order("slot_at")
        .limit(1)
        .maybeSingle(),
    ]);
    if (profile.data) {
      preferred = { name: profile.data.display_name, status: profile.data.status, nextSlot: slot.data?.slot_at ?? null };
    }
  }
  return {
    card: { follow_up: card.follow_up, next_step: card.next_step, accept_substitute: card.accept_substitute },
    preferred,
  };
}
