import { z } from "zod";
import { routing } from "@/i18n/routing";
import { runAI } from "@/lib/ai/runAI";
import { mergeMasterTask } from "@/lib/ai/tasks/merge-master";
import { getAsker } from "@/lib/auth/dal";
import { MASTER_SOURCE_LIMIT } from "@/lib/cards/types";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";

const Body = z.object({ locale: z.enum(routing.locales) });

/**
 * Merges the asker's approved session cards into a master card draft. Streams NDJSON like
 * /api/ai/card. Only the session cards' text and ids are read, as the asker.
 */
export async function POST(request: Request) {
  const asker = await getAsker();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!asker || !parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });

  const supabase = await createClient();
  const [{ data: rows }, { data: me }] = await Promise.all([
    supabase
      .from("cards")
      .select("id, approved_at, follow_up, covered, remaining, next_step")
      .eq("asker_id", asker.user_id)
      .eq("scope", "session")
      .eq("status", "approved")
      .order("approved_at", { ascending: false })
      .limit(MASTER_SOURCE_LIMIT),
    supabase.from("askers").select("org_id").eq("user_id", asker.user_id).single(),
  ]);
  if (!rows?.length || !me) return Response.json({ error: "no_sessions" }, { status: 400 });
  const cards = rows.reverse().map((c) => ({ ...c, approved_at: c.approved_at ?? "" }));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      const result = await runAI(
        mergeMasterTask,
        { locale: parsed.data.locale, cards },
        { orgId: me.org_id, actorId: asker.user_id },
        { onPartial: (data) => send({ type: "partial", data }) },
      );
      if (result.ok) {
        await createServiceClient().from("events").insert({
          org_id: me.org_id,
          type: "master_card_generated",
          actor_role: "asker",
          meta: { origin: "ai" },
        });
        send({ type: "done", data: result.data, meta: result.meta });
      } else {
        send({ type: "fallback", reason: result.reason });
      }
      controller.close();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
