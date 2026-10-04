// Wipes all asker data before a demo; keeps the organization and staff.
// Destructive, so it refuses to run without --yes:  npm run demo:reset -- --yes
import { createServiceClient } from "../lib/db/service";

// Presence as seeded (scripts/seed.ts).
const PRESENCE: Record<string, "available" | "busy" | "offline"> = {
  "daee1@wasl.demo": "available",
  "daee2@wasl.demo": "busy",
  "daee3@wasl.demo": "offline",
};
const ANY_UUID = "00000000-0000-0000-0000-000000000000";

async function main() {
  if (!process.argv.includes("--yes")) {
    console.error("This deletes every asker, conversation, message, notification and event.");
    console.error("Run again with --yes to confirm:  npm run demo:reset -- --yes");
    process.exit(1);
  }
  const db = createServiceClient();
  const fail = (step: string, error: { message: string } | null) => {
    if (error) throw new Error(`${step}: ${error.message}`);
  };

  // Rows without a foreign key to askers go first.
  fail("events", (await db.from("events").delete().gte("id", 0)).error);
  fail("notifications", (await db.from("notifications").delete().neq("id", ANY_UUID)).error);
  fail("return_attempts", (await db.from("return_attempts").delete().neq("pseudonym_key", "")).error);

  // Anonymous auth users own the asker rows; deleting them cascades to askers,
  // intakes, conversations, messages, cards and bookings.
  let anonymous = 0;
  for (let page = 1; ; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 1000 });
    fail("list users", error);
    const batch = data.users.filter((u) => u.is_anonymous);
    for (const user of batch) {
      fail(`delete user ${user.id}`, (await db.auth.admin.deleteUser(user.id)).error);
    }
    anonymous += batch.length;
    if (data.users.length < 1000) break;
  }

  // Anything left over (e.g. rows whose auth user was removed some other way).
  fail("messages", (await db.from("messages").delete().neq("id", ANY_UUID)).error);
  fail("conversations", (await db.from("conversations").delete().neq("id", ANY_UUID)).error);
  fail("intakes", (await db.from("intakes").delete().neq("id", ANY_UUID)).error);
  fail("askers", (await db.from("askers").delete().neq("user_id", ANY_UUID)).error);

  // Presence back to the seeded values.
  const { data: list, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 });
  fail("list staff", listError);
  for (const [email, status] of Object.entries(PRESENCE)) {
    const user = list.users.find((u) => u.email === email);
    if (user) fail(`presence ${email}`, (await db.from("profiles").update({ status }).eq("user_id", user.id)).error);
  }

  console.log(`Reset done: ${anonymous} anonymous users removed, asker data cleared, presence reset.`);
}

main().catch((error) => {
  console.error("Reset failed:", error.message ?? error);
  process.exit(1);
});
