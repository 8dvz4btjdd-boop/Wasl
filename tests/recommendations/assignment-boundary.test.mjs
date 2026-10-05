import { strict as assert } from "node:assert";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const execute = promisify(execFile);
const container = process.env.WASL_TEST_SQL_CONTAINER ?? "wasl-contextual-db";

test("actual assignment/receipt transactions serialize both handoff orders without a transaction-start leak", async (t) => {
  let ownership;
  try { ownership = await execute("docker", ["inspect", "--format", '{{index .Config.Labels "wasl.contextual.local"}}', container]); }
  catch { t.skip("Requires the labelled disposable contextual Postgres container; no external database is contacted."); return; }
  assert.equal(ownership.stdout.trim(), "true", "Refuse an unowned/non-test container");
  const database = `wasl_assignment_check_${randomBytes(6).toString("hex")}`;
  const baseArgs = ["exec", container, "psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At"];
  const sql = async (statement, db = database) => {
    const result = await execute("docker", ["exec", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-c", statement]);
    return result.stdout.trim();
  };
  const held = new Set();
  const holdTransaction = async (statement, name) => {
    const child = spawn("docker", ["exec", "-i", container, ...baseArgs.slice(2)], { stdio: ["pipe", "pipe", "pipe"] });
    held.add(child);
    let stderr = "";
    const exited = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code) => {
        held.delete(child);
        if (code === 0) resolve();
        else reject(new Error(`Synthetic transaction failed: ${stderr}`));
      });
    });
    child.stderr.on("data", (data) => { stderr += data.toString(); });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Synthetic transaction did not acquire its lock")), 5000);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data.toString();
        if (output.includes("LOCK_HELD")) { clearTimeout(timeout); resolve(); }
      });
      child.once("close", () => { clearTimeout(timeout); reject(new Error(stderr)); });
      child.stdin.write(`set application_name = '${name}';\nbegin;\n${statement};\nselect 'LOCK_HELD';\n`);
    });
    return async () => { child.stdin.end("commit;\n\\q\n"); await exited; };
  };
  const proveBlocked = async (name, settled) => {
    for (let i = 0; i < 20; i++) {
      assert.equal(settled(), false, "Operation must wait for the other handoff transaction");
      if (await sql(`select count(*) from pg_stat_activity where datname='${database}' and application_name='${name}' and wait_event_type='Lock'`) === "1") return;
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    assert.fail("Expected an actual database row-lock wait");
  };
  await sql(`create database ${database} template template0`, "postgres");
  try {
    await sql(`create table public.conversations(id uuid primary key, daee_id uuid, assigned_at timestamptz);
      create table public.messages(id uuid primary key, conversation_id uuid references public.conversations(id), body text, created_at timestamptz default now());
      insert into public.conversations values('77777777-0014-4000-8000-000000000001','77777777-0014-4000-8000-000000000010','2000-01-01');`);
    for (const migration of ["0015_recommendation_message_receipts.sql", "0016_recommendation_assignment_boundary.sql"]) {
      await sql(await readFile(new URL(`../../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    // Same transaction: now() predates the old message, but the new assignment clock does not.
    assert.equal(await sql(`begin;
      insert into public.messages values('77777777-0014-4000-8000-000000000030','77777777-0014-4000-8000-000000000001','SYNTHETIC prior question','2099-01-01',null);
      update public.conversations set daee_id='77777777-0014-4000-8000-000000000011',assigned_at=now();
      select m.received_at < c.assigned_at from public.messages m join public.conversations c on c.id=m.conversation_id where m.id='77777777-0014-4000-8000-000000000030';
      commit;`), "BEGIN\nINSERT 0 1\nUPDATE 1\nt\nCOMMIT");
    // Transfer updates the row but has not committed: a concurrent message cannot slip in.
    const finishTransfer = await holdTransaction("update public.conversations set daee_id='77777777-0014-4000-8000-000000000012',assigned_at=now()", "synthetic_transfer_holds");
    let insertSettled = false;
    const inserting = sql(`set application_name='synthetic_insert_waits';
      insert into public.messages(id,conversation_id,body,created_at) values('77777777-0014-4000-8000-000000000031','77777777-0014-4000-8000-000000000001','SYNTHETIC after handoff','2000-01-01')`).finally(() => { insertSettled = true; });
    await proveBlocked("synthetic_insert_waits", () => insertSettled);
    await finishTransfer(); await inserting;
    assert.equal(await sql("select m.received_at >= c.assigned_at from public.messages m join public.conversations c on c.id=m.conversation_id where m.id='77777777-0014-4000-8000-000000000031'"), "t");
    // Reverse order: an in-progress old receipt commits before the assignment may advance.
    const finishMessage = await holdTransaction("insert into public.messages(id,conversation_id,body,created_at) values('77777777-0014-4000-8000-000000000032','77777777-0014-4000-8000-000000000001','SYNTHETIC before next handoff','2099-01-01')", "synthetic_message_holds");
    let transferSettled = false;
    const transferring = sql("set application_name='synthetic_transfer_waits'; update public.conversations set daee_id='77777777-0014-4000-8000-000000000013',assigned_at=now()").finally(() => { transferSettled = true; });
    await proveBlocked("synthetic_transfer_waits", () => transferSettled);
    await finishMessage(); await transferring;
    assert.equal(await sql("select m.received_at < c.assigned_at from public.messages m join public.conversations c on c.id=m.conversation_id where m.id='77777777-0014-4000-8000-000000000032'"), "t");
  } finally {
    for (const child of held) child.stdin.end("rollback;\n\\q\n");
    await sql(`drop database ${database} with (force)`, "postgres");
  }
});
