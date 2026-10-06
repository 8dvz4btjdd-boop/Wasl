import "server-only";
import { createHash } from "node:crypto";
import { runAI } from "@/lib/ai/runAI";
import { allowedDomain, askerAllowed, isFeqhia, rejectReason, type Audience } from "@/lib/ai/sources/allowlist";
import { extendCitation } from "@/lib/ai/sources/fetch";
import { isSubstantiveNeed, normalizeNeed } from "@/lib/ai/sources/needs";
import { findSourcesTask } from "@/lib/ai/tasks/find-sources";
import { planQueriesTask } from "@/lib/ai/tasks/plan-queries";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";

export type Reading = {
  id: string | null;
  title: string;
  text: string;
  url: string;
  verified_by: "human" | "auto";
  /** dorar.net feqhia: shown to the daee only, labeled as fiqh that is not a fatwa. */
  feqhia: boolean;
};
export type ReadingsResult = { items: Reading[]; live: boolean; tier: "need" | "live" | "topic" | "none" };

type Query = {
  orgId: string;
  actorId: string | null;
  conversationId: string | null;
  /** The need: the confirmed summary, the selected messages, or what the daee typed. */
  need: string;
  /** Up to 6 recent messages, oldest first, for what the need refers to. */
  recent: { role: "asker" | "daee"; text: string }[];
  topic: string;
  level: "a" | "b" | "c" | "d";
  locale: string;
  audience: Audience;
  /** Record what the asker was shown, for their daee. */
  recordShown?: boolean;
};

const LIMIT = 3;
export const needHash = (need: string) => createHash("sha256").update(normalizeNeed(need)).digest("hex");

/**
 * Readings tailored to the need, verbatim with their source. Order: readings already found
 * for this exact need (normalized, sha256), then a live search planned from the need and the
 * recent messages (each citation extended to its original passage when the page allows, and
 * fenced again), then human-verified items for the topic and locale as the fallback (also the
 * path with AI off). Greetings, thanks and repeats never search. Askers get nothing at level
 * c or d, and never what the rules keep from askers.
 */
export async function getReadings(q: Query): Promise<ReadingsResult> {
  const none: ReadingsResult = { items: [], live: false, tier: "none" };
  if (q.audience === "asker" && (q.level === "c" || q.level === "d")) return none;
  if (!isSubstantiveNeed(q.need)) return none;
  const db = createServiceClient();
  const hash = needHash(q.need);
  const forAudience = (url: string) => Boolean(allowedDomain(url)) && (q.audience === "daee" || askerAllowed(url));

  // 1. This exact need, already found.
  {
    let query = db
      .from("library_items")
      .select("id, title, body, source_url, verified_by")
      .eq("org_id", q.orgId)
      .eq("need_hash", hash)
      .eq("language", q.locale)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (q.audience === "asker") query = query.eq("asker_ok", true);
    const { data } = await query;
    const items = (data ?? []).filter((r) => forAudience(r.source_url)).map((r) => toReading(r));
    if (items.length) return finish(q, { items, live: false, tier: "need" }, hash);
  }

  // 2. A live search, planned from the need (queries only, never an answer).
  const ctx = { orgId: q.orgId, actorId: q.actorId, conversationId: q.conversationId };
  const plan = await runAI(planQueriesTask, { question: q.need, recent: q.recent, topic: q.topic, locale: q.locale }, ctx);
  if (plan.ok || plan.reason !== "disabled") {
    const queries = plan.ok ? plan.data.queries : [q.need.slice(0, 120)];
    const found = await runAI(findSourcesTask, { question: q.need, queries, topic: q.topic, level: q.level, locale: q.locale, audience: q.audience }, ctx);
    if (found.ok && found.data.items.length) {
      const extended = await Promise.all(
        found.data.items.map(async (c) => {
          const passage = await extendCitation(c).catch(() => null);
          // The longer passage must pass the same fence; otherwise the snippet stays.
          const ok = passage?.extended && !rejectReason({ ...c, cited_text: passage.text }, q.audience);
          const text = ok ? passage!.text : c.cited_text;
          return { c, text, hash: createHash("sha256").update(text).digest("hex") };
        }),
      );
      for (const { c, text, hash: passageHash } of extended) {
        const { error } = await db.from("library_items").insert({
          org_id: q.orgId,
          title: c.title || allowedDomain(c.url)!,
          body: text,
          cited_text: c.cited_text,
          source_name: allowedDomain(c.url)!,
          source_url: c.url,
          topic: q.topic,
          level: q.level,
          language: q.locale,
          verified_by: "auto",
          asker_ok: askerAllowed(c.url) && !rejectReason({ ...c, cited_text: text }, "asker"),
          need_hash: hash,
          passage_hash: passageHash,
        });
        if (error && error.code !== "23505") logServerError("readings.store", error);
        await db.from("source_pages").upsert({ url: c.url, title: c.title, domain: allowedDomain(c.url)!, fetched_at: new Date().toISOString() }, { onConflict: "url" });
      }
      const items = extended.map(({ c, text }) => toReading({ id: null, title: c.title, body: text, source_url: c.url, verified_by: "auto" })).slice(0, LIMIT);
      return finish(q, { items, live: true, tier: "live" }, hash);
    }
  }

  // 3. Human-verified items for the topic and locale (also with AI off).
  {
    let query = db
      .from("library_items")
      .select("id, title, body, source_url, verified_by")
      .eq("org_id", q.orgId)
      .eq("topic", q.topic)
      .eq("language", q.locale)
      .eq("verified_by", "human")
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    if (q.audience === "asker") query = query.eq("asker_ok", true).in("level", ["a", "b"]);
    const { data } = await query;
    const items = (data ?? []).filter((r) => forAudience(r.source_url)).map((r) => toReading(r));
    return finish(q, { items, live: plan.ok || plan.reason !== "disabled", tier: items.length ? "topic" : "none" }, hash);
  }
}

function toReading(r: { id: string | null; title: string; body: string; source_url: string; verified_by: string }): Reading {
  return { id: r.id, title: r.title, text: r.body, url: r.source_url, verified_by: r.verified_by === "human" ? "human" : "auto", feqhia: isFeqhia(r.source_url) };
}

async function finish(q: Query, result: ReadingsResult, hash: string): Promise<ReadingsResult> {
  const db = createServiceClient();
  if (q.recordShown && q.conversationId && result.items.length) {
    const { error } = await db.from("conversation_readings").insert({ conversation_id: q.conversationId, items: result.items, need_hash: hash });
    if (error) logServerError("readings.recordShown", error);
  }
  const { error } = await db.from("events").insert({
    org_id: q.orgId,
    type: "sources_found",
    conversation_id: q.conversationId,
    actor_role: q.audience,
    meta: { count: result.items.length, live: result.live, tier: result.tier },
  });
  if (error) logServerError("readings.logFound", error);
  return result;
}
