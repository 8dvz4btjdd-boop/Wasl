import { z } from "zod";
import { runAI } from "@/lib/ai/runAI";
import { cardTask } from "@/lib/ai/tasks/card";
import { routing } from "@/i18n/routing";
import { getAsker } from "@/lib/auth/dal";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";

const Body = z.object({
  conversationId: z.uuid(),
  messageIds: z.array(z.uuid()).min(1).max(500),
  locale: z.enum(routing.locales),
});

/**
 * Drafts a Wasl card from the messages the asker selected. Streams NDJSON lines:
 * { type: "partial", data } while the model writes, then { type: "done", data, meta } or
 * { type: "fallback", reason }. Only the selected messages are read, by id, as the asker.
 */
export async function POST(request: Request) {
  const asker = await getAsker();
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!asker || !parsed.success) return Response.json({ error: "bad_request" }, { status: 400 });
  const { conversationId, messageIds, locale } = parsed.data;

  const supabase = await createClient();
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, org_id")
    .eq("id", conversationId)
    .eq("asker_id", asker.user_id)
    .maybeSingle();
  if (!conversation) return Response.json({ error: "not_found" }, { status: 404 });

  const ids = [...new Set(messageIds)];
  const { data: rows } = await supabase
    .from("messages")
    .select("id, sender_role, body, created_at")
    .eq("conversation_id", conversationId)
    .in("id", ids)
    .order("created_at");
  if (!rows || rows.length !== ids.length) return Response.json({ error: "bad_selection" }, { status: 400 });

  // At most the latest 60 selected messages are read (the asker is told).
  const input = {
    locale,
    messages: rows.slice(-60).map((m) => ({ id: m.id, role: m.sender_role === "asker" ? ("asker" as const) : ("daee" as const), body: m.body })),
  };

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      const result = await runAI(
        cardTask,
        input,
        { orgId: conversation.org_id, actorId: asker.user_id, conversationId },
        { onPartial: (data) => send({ type: "partial", data }) },
      );
      if (result.ok) {
        await createServiceClient().from("events").insert({
          org_id: conversation.org_id,
          type: "card_generated",
          conversation_id: conversationId,
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

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" },
  });
}
