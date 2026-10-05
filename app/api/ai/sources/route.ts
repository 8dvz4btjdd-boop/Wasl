import { z } from "zod";
import { getAsker, getStaff } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { getReadings } from "@/lib/sources/readings";

// A live search of the approved sites can take a while.
export const maxDuration = 60;

const Body = z.object({ conversationId: z.uuid() });
const LEVEL = { intro: "a", explain: "b", detailed: "c" } as const;

/**
 * Readings for a conversation's question: for the asker who owns it, or a daee who can read
 * it (RLS). The audience comes from the session, never from the request.
 */
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const [asker, staff] = await Promise.all([getAsker(), getStaff()]);
  const audience = asker ? ("asker" as const) : staff?.role === "daee" ? ("daee" as const) : null;
  if (!audience) return Response.json({ error: "forbidden" }, { status: 403 });

  const supabase = await createClient();
  const { data: c } = await supabase
    .from("conversations")
    .select("id, org_id, topic, depth, level, guide_summary, intake:intakes(raw_text), asker:askers(language)")
    .eq("id", parsed.data.conversationId)
    .maybeSingle();
  if (!c) return Response.json({ error: "not_found" }, { status: 404 });
  // A personal ruling needs a specialist: no readings are suggested for it.
  if (c.level === "d") return Response.json({ items: [], live: false });
  // The guide's confirmed summary when there is one, else the first message.
  let question = c.guide_summary ?? (c.intake as { raw_text: string } | null)?.raw_text ?? "";
  if (!question) {
    const { data: first } = await supabase.from("messages").select("body").eq("conversation_id", c.id).eq("sender_role", "asker").order("created_at").limit(1).maybeSingle();
    question = first?.body ?? "";
  }
  if (!question) return Response.json({ items: [], live: false });

  const result = await getReadings({
    orgId: c.org_id,
    actorId: asker?.user_id ?? staff?.user_id ?? null,
    conversationId: c.id,
    question,
    topic: c.topic ?? "general",
    level: (c.level as "a" | "b" | "c" | "d" | null) ?? (c.depth ? LEVEL[c.depth] : "b"),
    locale: (c.asker as { language: string } | null)?.language ?? "ar",
    audience,
  });
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
