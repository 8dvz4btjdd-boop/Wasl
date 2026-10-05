import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const execute = promisify(execFile);
const container = process.env.WASL_TEST_SQL_CONTAINER ?? "wasl-contextual-db";

test("actual DB receipt is server-set/immutable, preserves legacy NULL and ignores forged created_at for segment cuts", async (t) => {
  let ownership;
  try { ownership = await execute("docker", ["inspect", "--format", '{{index .Config.Labels "wasl.contextual.local"}}', container]); }
  catch { t.skip("Requires the labelled disposable contextual Postgres container; no external database is contacted."); return; }
  assert.equal(ownership.stdout.trim(), "true", "Refuse an unowned/non-test container");
  const database = `wasl_receipt_check_${randomBytes(6).toString("hex")}`;
  const sql = async (statement, db = database) => {
    const result = await execute("docker", ["exec", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-c", statement]);
    return result.stdout.trim();
  };
  await sql(`create database ${database} template template0`, "postgres");
  try {
    await sql(`create table public.messages(id uuid primary key, body text, created_at timestamptz not null default now());
      insert into public.messages values('44444444-0013-4000-8000-000000000001','SYNTHETIC legacy','2099-01-01');
      grant select, insert, update on public.messages to authenticated;`);
    await sql(await readFile(new URL("../../supabase/migrations/0015_recommendation_message_receipts.sql", import.meta.url), "utf8"));
    assert.equal(await sql("select received_at is null from public.messages where body = 'SYNTHETIC legacy'"), "t", "never invent a historic receipt through backfill");
    await sql(`set role authenticated;
      insert into public.messages(id,body,created_at,received_at) values
        ('44444444-0013-4000-8000-000000000002','SYNTHETIC old segment','2099-01-01','2099-01-01');
      reset role;`);
    assert.equal(await sql("select received_at between now() - interval '1 minute' and now() from public.messages where body = 'SYNTHETIC old segment'"), "t", "future client timestamp is overwritten at insertion");
    const before = await sql("select received_at::text from public.messages where body = 'SYNTHETIC old segment'");
    await assert.rejects(sql("set role authenticated; update public.messages set received_at = '2099-01-01' where body = 'SYNTHETIC old segment'"), /message receipt is immutable/);
    assert.equal(await sql("select received_at::text from public.messages where body = 'SYNTHETIC old segment'"), before);
    await sql("create table synthetic_assignment(started_at timestamptz); insert into synthetic_assignment values(clock_timestamp())");
    await sql(`set role authenticated;
      insert into public.messages(id,body,created_at,received_at) values
        ('44444444-0013-4000-8000-000000000003','SYNTHETIC new segment','2000-01-01','2000-01-01');
      update public.messages set created_at = '2099-01-01' where body = 'SYNTHETIC old segment';
      reset role;`);
    assert.equal(await sql("select received_at between now() - interval '1 minute' and now() from public.messages where body = 'SYNTHETIC new segment'"), "t", "past client timestamp is overwritten too");
    assert.equal(await sql("select string_agg(body,',') from public.messages where received_at >= (select started_at from synthetic_assignment)"), "SYNTHETIC new segment", "legacy and forged future created_at cannot enter the transferred segment");
  } finally {
    await sql(`drop database ${database} with (force)`, "postgres");
  }
});
