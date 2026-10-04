// LOCAL VERIFICATION ONLY. Inserts tagged synthetic metrics so every admin tile, chart and
// alert can be checked, and removes exactly that data again.
//   node --env-file=.env.local scripts/dev/admin-synthetic.mjs --seed
//   node --env-file=.env.local scripts/dev/admin-synthetic.mjs --remove
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const ORG = "00000000-0000-4000-8000-000000000001";
const TAG = { synthetic: true };
const ASKER_NAME = "synthetic-fr-waiting";
const ago = (minutes) => new Date(Date.now() - minutes * 60_000).toISOString();

async function seed() {
  const events = [];
  const event = (type, minutesAgo, meta = {}, conversation_id = randomUUID()) =>
    events.push({ org_id: ORG, type, created_at: ago(minutesAgo), conversation_id, actor_role: "system", meta: { ...TAG, ...meta } });

  // Correct first routing: 8 routed, 1 transferred -> 7 / 8.
  const routed = Array.from({ length: 8 }, (_, i) => {
    const id = randomUUID();
    event("routed", 30 + i * 5, {}, id);
    return id;
  });
  event("transfer_completed", 20, { from_daee: "synthetic", to_daee: "synthetic" }, routed[0]);

  // Follow-up sessions per mode with a first substantive reply after a mode-typical delay (seconds).
  const sessions = { none: [6, 260], manual: [6, 150], ai: [7, 95] };
  for (const [mode, [count, delay]] of Object.entries(sessions)) {
    for (let i = 0; i < count; i++) {
      const id = randomUUID();
      const startedAgo = 120 + i * 7;
      event("followup_started", startedAgo, { mode }, id);
      event("first_substantive_reply", startedAgo - (delay + i * 10) / 60, {}, id);
    }
  }
  // Ratings: none 3/6, manual 5/6, ai 6/7. (Correct resumption counts manual + ai: 11 / 13.)
  const ratings = { none: [6, 3], manual: [6, 5], ai: [7, 6] };
  for (const [mode, [count, sufficient]] of Object.entries(ratings)) {
    for (let i = 0; i < count; i++) event("followup_rated", 60 + i * 3, { mode, sufficient: i < sufficient });
  }
  // Card accuracy: 9 approved, 2 with a major edit -> 7 / 9.
  for (let i = 0; i < 9; i++) event("card_approved", 50 + i * 4, { origin: i % 2 ? "ai" : "manual", edited_major: i < 2 });
  for (let i = 0; i < 9; i++) event("card_generated", 55 + i * 4, { origin: i % 2 ? "ai" : "manual" });

  const { error: eventsError } = await db.from("events").insert(events);
  if (eventsError) throw eventsError;

  // AI runs: 12, 2 fallbacks.
  const runs = Array.from({ length: 12 }, (_, i) => ({
    org_id: ORG,
    task: ["intake", "classify", "card", "rank_library"][i % 4],
    model: i % 4 === 2 ? "claude-sonnet-5-5" : "claude-haiku-4-5-20251001",
    input_hash: "synthetic",
    latency_ms: i < 2 ? null : 600 + i * 140,
    fallback: i < 2,
    reason: i < 2 ? "api_error" : null,
    created_at: ago(40 + i * 6),
  }));
  const { error: runsError } = await db.from("ai_runs").insert(runs);
  if (runsError) throw runsError;

  // One asker waiting 25 minutes in French with no French-speaking daee available: both alerts.
  const { data: user, error: userError } = await db.auth.admin.createUser({ email: `${randomUUID()}@synthetic.invalid`, email_confirm: true });
  if (userError) throw userError;
  await db.from("askers").insert({ user_id: user.user.id, org_id: ORG, pseudonym: ASKER_NAME, language: "fr", return_code_hash: "synthetic" });
  await db.from("conversations").insert({ org_id: ORG, asker_id: user.user.id, topic: "general", status: "waiting", created_at: ago(25) });

  console.log(`seeded ${events.length} events, ${runs.length} AI runs, 1 waiting asker`);
}

async function remove() {
  const events = await db.from("events").delete().eq("meta->>synthetic", "true").select("id");
  const runs = await db.from("ai_runs").delete().eq("input_hash", "synthetic").select("id");
  const { data: askers } = await db.from("askers").select("user_id").eq("pseudonym", ASKER_NAME);
  for (const a of askers ?? []) await db.auth.admin.deleteUser(a.user_id);
  console.log(`removed ${events.data?.length ?? 0} events, ${runs.data?.length ?? 0} AI runs, ${askers?.length ?? 0} asker`);
}

if (process.argv.includes("--seed")) await seed();
else if (process.argv.includes("--remove")) await remove();
else console.log("Use --seed or --remove");
