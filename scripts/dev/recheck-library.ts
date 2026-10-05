// Re-applies the fence to stored auto-verified readings after a rule changes: items the
// daee rules now reject are removed; items the asker rules reject are kept for daee only.
//   npx tsx --env-file=.env.local --conditions=react-server scripts/dev/recheck-library.ts
import { rejectReason } from "../../lib/ai/sources/allowlist";
import { createServiceClient } from "../../lib/db/service";

async function main() {
  const db = createServiceClient();
  const { data } = await db.from("library_items").select("id, title, body, cited_text, source_url, asker_ok").eq("verified_by", "auto");
  let removed = 0;
  let restricted = 0;
  for (const r of data ?? []) {
    const c = { url: r.source_url, title: r.title, cited_text: r.cited_text ?? r.body };
    if (rejectReason(c, "daee")) {
      await db.from("library_items").delete().eq("id", r.id);
      removed++;
    } else if (r.asker_ok && rejectReason(c, "asker")) {
      await db.from("library_items").update({ asker_ok: false }).eq("id", r.id);
      restricted++;
    }
  }
  console.log(`auto items: ${data?.length ?? 0}, removed ${removed}, daee-only ${restricted}`);
}

void main();
