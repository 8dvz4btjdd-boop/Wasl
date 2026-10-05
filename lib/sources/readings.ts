import "server-only";
import { runAI } from "@/lib/ai/runAI";
import { allowedDomain, askerAllowed, type Audience } from "@/lib/ai/sources/allowlist";
import { findSourcesTask } from "@/lib/ai/tasks/find-sources";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";

export type Reading = { id: string | null; title: string; text: string; url: string; verified_by: "human" | "auto" };
export type ReadingsResult = { items: Reading[]; live: boolean };

type Query = {
  orgId: string;
  actorId: string | null;
  conversationId: string | null;
  question: string;
  topic: string;
  level: "a" | "b" | "c" | "d";
  locale: string;
  audience: Audience;
};

const LIMIT = 3;

/**
 * Readings for a question, verbatim with their source. Order: items a human verified for
 * the topic and locale, then items the fence verified automatically, then a live search of
 * the approved sites (stored as auto). Askers get nothing at level c or d, and never an
 * item the rules keep from askers.
 */
export async function getReadings(q: Query): Promise<ReadingsResult> {
  if (q.audience === "asker" && (q.level === "c" || q.level === "d")) return { items: [], live: false };
  const db = createServiceClient();

  for (const verifiedBy of ["human", "auto"] as const) {
    let query = db
      .from("library_items")
      .select("id, title, body, cited_text, source_url, verified_by")
      .eq("org_id", q.orgId)
      .eq("topic", q.topic)
      .eq("language", q.locale)
      .eq("verified_by", verifiedBy)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (q.audience === "asker") query = query.eq("asker_ok", true).in("level", ["a", "b"]);
    const { data } = await query;
    // The fence applies to stored items too: nothing off the list is ever shown.
    const items = (data ?? [])
      .filter((r) => allowedDomain(r.source_url) && (q.audience === "daee" || askerAllowed(r.source_url)))
      .map((r) => ({ id: r.id, title: r.title, text: r.cited_text ?? r.body, url: r.source_url, verified_by: verifiedBy }));
    if (items.length) {
      await logFound(q, items.length, false);
      return { items, live: false };
    }
  }

  const result = await runAI(findSourcesTask, { question: q.question, topic: q.topic, level: q.level, locale: q.locale, audience: q.audience }, {
    orgId: q.orgId,
    actorId: q.actorId,
    conversationId: q.conversationId,
  });
  if (!result.ok) return { items: [], live: true };

  const items: Reading[] = result.data.items.map((c) => ({ id: null, title: c.title, text: c.cited_text, url: c.url, verified_by: "auto" }));
  if (result.data.items.length) {
    const rows = result.data.items.map((c) => ({
      org_id: q.orgId,
      title: c.title || allowedDomain(c.url)!,
      body: c.cited_text,
      cited_text: c.cited_text,
      source_name: allowedDomain(c.url)!,
      source_url: c.url,
      topic: q.topic,
      level: q.level,
      language: q.locale,
      verified_by: "auto",
      asker_ok: askerAllowed(c.url),
    }));
    // One by one: the unique index (topic, locale, url, body) makes a repeat a no-op.
    for (const row of rows) await db.from("library_items").insert(row);
    await db.from("source_pages").upsert(
      result.data.items.map((c) => ({ url: c.url, title: c.title, domain: allowedDomain(c.url)!, fetched_at: new Date().toISOString() })),
      { onConflict: "url" },
    );
  }
  await logFound(q, items.length, true);
  return { items, live: true };
}

async function logFound(q: Query, count: number, live: boolean) {
  const { error } = await createServiceClient().from("events").insert({
    org_id: q.orgId,
    type: "sources_found",
    conversation_id: q.conversationId,
    actor_role: q.audience,
    meta: { count, live },
  });
  if (error) logServerError("readings.logFound", error);
}
