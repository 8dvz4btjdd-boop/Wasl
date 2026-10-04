// Synthetic demo data. Safe to run repeatedly: every write is an upsert or a lookup first.
// Run with `npm run seed` (needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_PASSWORD).
import { createServiceClient } from "../lib/db/service";
import type { Database } from "../lib/db/types";

type Profile = Database["public"]["Tables"]["profiles"]["Insert"];

const ORG_ID = "00000000-0000-4000-8000-000000000001";

const STAFF: Array<{ email: string } & Omit<Profile, "user_id" | "org_id">> = [
  { email: "admin@wasl.demo", role: "admin", display_name: "Demo Admin", languages: ["ar", "en"], topics: [] },
  { email: "daee1@wasl.demo", role: "daee", display_name: "Khalid", languages: ["ar", "en"], topics: ["tawhid", "quran", "general"], status: "available", capacity: 3 },
  { email: "daee2@wasl.demo", role: "daee", display_name: "Amina", languages: ["en", "fr"], topics: ["prophet", "worship", "ethics"], status: "available", capacity: 3 },
  { email: "daee3@wasl.demo", role: "daee", display_name: "Yusuf", languages: ["es", "en", "ar"], topics: ["doubts", "general", "quran"], status: "offline", capacity: 2 },
];

// Slot start hours in Riyadh time (UTC+3, no DST), one set per daee.
const SLOT_HOURS_RIYADH = [
  [10, 14, 19],
  [11, 16, 20],
  [9, 13, 18],
];
const RIYADH_OFFSET_HOURS = 3;
const DAYS = 7;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name}. Set it in .env.local.`);
    process.exit(1);
  }
  return value;
}

async function main() {
  requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const password = requireEnv("DEMO_PASSWORD");
  const db = createServiceClient();

  // Organization. return_code_salt is not sent, so an existing salt is kept.
  const { error: orgError } = await db
    .from("organizations")
    .upsert({ id: ORG_ID, name: "Wasl Demo Center", hours: "Sun–Thu 09:00–21:00 (Riyadh)" });
  if (orgError) throw orgError;
  console.log("organization: upserted");

  // Staff users.
  const { data: list, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw listError;
  const byEmail = new Map(list.users.map((u) => [u.email?.toLowerCase(), u]));

  const daeeIds: string[] = [];
  for (const { email, ...profile } of STAFF) {
    let userId = byEmail.get(email)?.id;
    if (userId) {
      const { error } = await db.auth.admin.updateUserById(userId, { password, email_confirm: true });
      if (error) throw error;
      console.log(`${email}: exists, password synced`);
    } else {
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      userId = data.user.id;
      console.log(`${email}: created`);
    }

    const { error: profileError } = await db
      .from("profiles")
      .upsert({ ...profile, user_id: userId, org_id: ORG_ID }, { onConflict: "user_id" });
    if (profileError) throw profileError;
    if (profile.role === "daee") daeeIds.push(userId);
  }

  // Availability for the next 7 days. Existing slots (and their booked flag) are left alone.
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const slots = daeeIds.flatMap((daeeId, i) =>
    Array.from({ length: DAYS }, (_, day) =>
      SLOT_HOURS_RIYADH[i % SLOT_HOURS_RIYADH.length].map((hour) => {
        const at = new Date(today);
        at.setUTCDate(at.getUTCDate() + day + 1);
        at.setUTCHours(hour - RIYADH_OFFSET_HOURS);
        return { daee_id: daeeId, slot_at: at.toISOString() };
      }),
    ).flat(),
  );
  const { data: inserted, error: slotError } = await db
    .from("availability")
    .upsert(slots, { onConflict: "daee_id,slot_at", ignoreDuplicates: true })
    .select("id");
  if (slotError) throw slotError;
  console.log(`availability: ${inserted.length} new of ${slots.length} slots`);
}

main().catch((error) => {
  console.error("Seed failed:", error.message ?? error);
  process.exit(1);
});
