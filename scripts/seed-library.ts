// Seeds the reading library from a CSV of human-verified passages (wasl_reading_library.csv).
//   npm run library:seed -- [path] [--dry-run]
// Every row goes through the validator: an allowlisted source URL, the per-domain rules, a
// known topic, language and level, and a non-empty verbatim body. Valid rows are upserted by
// item_key with verified_by = human; invalid rows are reported and skipped. Bodies are never
// edited.
import { readFileSync } from "node:fs";
import { allowedDomain, rejectReason } from "../lib/ai/sources/allowlist";
import { TOPICS } from "../lib/chat/types";
import { createServiceClient } from "../lib/db/service";

const LANGUAGES = ["ar", "en", "fr", "es", "ur", "id", "tl"];
const LEVELS = ["a", "b", "c", "d"];

/** RFC 4180 CSV: quoted fields may hold commas, quotes ("") and newlines. */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim())) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field || row.length) {
    row.push(field);
    if (row.some((f) => f.trim())) rows.push(row);
  }
  return rows;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const path = args.find((a) => !a.startsWith("--")) ?? "wasl_reading_library.csv";
  const [header, ...rows] = parseCsv(readFileSync(path, "utf8"));
  const col = (name: string) => header.indexOf(name);
  for (const name of ["item_key", "language", "topic", "level", "title", "body", "source_name", "source_url"]) {
    if (col(name) < 0) throw new Error(`Missing column: ${name}`);
  }

  const db = createServiceClient();
  const { data: org } = await db.from("organizations").select("id").order("created_at").limit(1).single();
  if (!org) throw new Error("No organization");

  let ok = 0;
  const problems: string[] = [];
  for (const r of rows) {
    const get = (name: string) => (r[col(name)] ?? "").trim();
    const key = get("item_key");
    const body = r[col("body")] ?? "";
    const url = get("source_url");
    const reasons = [
      !key && "no item_key",
      !LANGUAGES.includes(get("language")) && `language ${get("language")}`,
      !(TOPICS as readonly string[]).includes(get("topic")) && `topic ${get("topic")}`,
      !LEVELS.includes(get("level").toLowerCase()) && `level ${get("level")}`,
      !get("title") && "no title",
      !body.trim() && "no body",
      !allowedDomain(url) && `domain not allowed (${url})`,
    ].filter(Boolean);
    // The per-domain rules decide who may see it: the daee rules must pass to keep it at all.
    const daeeReject = allowedDomain(url) ? rejectReason({ url, title: get("title"), cited_text: body }, "daee") : null;
    if (daeeReject) reasons.push(`rule ${daeeReject}`);
    if (reasons.length) {
      problems.push(`${key || "(no key)"}: ${reasons.join(", ")}`);
      continue;
    }
    const askerOk = rejectReason({ url, title: get("title"), cited_text: body }, "asker") === null;
    const item = {
      org_id: org.id,
      item_key: key,
      title: get("title"),
      body,
      cited_text: null,
      source_name: get("source_name") || allowedDomain(url)!,
      source_url: url,
      topic: get("topic"),
      level: get("level").toLowerCase(),
      language: get("language"),
      verified_by: "human",
      asker_ok: askerOk,
    };
    ok++;
    if (dryRun) continue;
    const { data: existing } = await db.from("library_items").select("id").eq("org_id", org.id).eq("item_key", key).eq("language", item.language).maybeSingle();
    const { error } = existing
      ? await db.from("library_items").update(item).eq("id", existing.id)
      : await db.from("library_items").insert(item);
    if (error) problems.push(`${key}: ${error.message}`);
  }
  console.log(`${dryRun ? "valid (dry run)" : "seeded"}: ${ok} of ${rows.length}`);
  for (const p of problems) console.log(`skipped ${p}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
