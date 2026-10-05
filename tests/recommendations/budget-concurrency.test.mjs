import { strict as assert } from "node:assert";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

const execute = promisify(execFile);
const container = process.env.WASL_TEST_SQL_CONTAINER ?? "wasl-contextual-db";

test("actual concurrent reservations share one global cap without duplicate retry charges", async (t) => {
  let ownership;
  try { ownership = await execute("docker", ["inspect", "--format", '{{index .Config.Labels "wasl.contextual.local"}}', container]); }
  catch { t.skip("Requires the labelled disposable contextual test Postgres container; no external database is contacted."); return; }
  assert.equal(ownership.stdout.trim(), "true", "Refuse an unowned/non-test container");
  // A separate synthetic database avoids changing either the app seed or its test allowance.
  const database = `wasl_budget_check_${randomBytes(6).toString("hex")}`;
  const sql = async (statement, db = database) => {
    const result = await execute("docker", ["exec", container, "psql", "-U", "postgres", "-d", db, "-v", "ON_ERROR_STOP=1", "-At", "-c", statement], { maxBuffer: 1024 * 1024 });
    return result.stdout.trim();
  };
  await sql(`create database ${database} template template0`, "postgres");
  try {
    await sql(`create table public.organizations(id uuid primary key);
      create table public.recommendation_jobs(request_id uuid primary key, org_id uuid, mode text, state text);
      insert into public.organizations values('33333333-0012-4000-8000-000000000001'),('33333333-0012-4000-8000-000000000002');
      insert into public.recommendation_jobs values
        ('33333333-0012-4000-8000-000000000010','33333333-0012-4000-8000-000000000001','automatic','running'),
        ('33333333-0012-4000-8000-000000000011','33333333-0012-4000-8000-000000000002','automatic','running');`);
    await sql(await readFile(new URL("../../supabase/migrations/0014_recommendation_test_budget.sql", import.meta.url), "utf8"));
    await sql("insert into public.recommendation_budget_authorizations(authorization_id,reserved_usd) values('contextual-test-2026-10-05',4.85)");
    const requests = [
      { request: "33333333-0012-4000-8000-000000000010", org: "33333333-0012-4000-8000-000000000001" },
      { request: "33333333-0012-4000-8000-000000000011", org: "33333333-0012-4000-8000-000000000002" },
    ];
    const reserve = ({ request, org }) => sql(`select public.recommendation_reserve_budget('${request}','${org}',0.15,5)`);
    const outcomes = await Promise.all(requests.map(reserve));
    assert.equal(outcomes.filter((outcome) => outcome === "t").length, 1, "only one concurrent request fits the remaining allowance");
    assert.equal(outcomes.filter((outcome) => outcome === "f").length, 1);
    assert.equal(await sql("select reserved_usd from public.recommendation_budget_authorizations"), "5.000000");
    assert.equal(await sql("select count(*) from public.recommendation_budget_reservations"), "1");
    const winner = requests[outcomes.indexOf("t")];
    const retry = await Promise.all(Array.from({ length: 4 }, () => reserve(winner)));
    assert.ok(retry.every((outcome) => outcome === "t"));
    assert.equal(await sql("select reserved_usd from public.recommendation_budget_authorizations"), "5.000000");
    assert.equal(await sql("select count(*) from public.recommendation_budget_reservations"), "1");
  } finally {
    await sql(`drop database ${database} with (force)`, "postgres");
  }
});
