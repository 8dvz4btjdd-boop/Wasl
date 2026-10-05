// Disposable LOCAL runtime for recommendation browser checks. Never reads .env files.
import { createHmac, randomBytes, createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, chmodSync, existsSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { spawnSync, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const repository = resolve(fileURLToPath(new URL("../../", import.meta.url)));
const state = resolve(process.env.CONTEXTUAL_LOCAL_STATE ?? "/workspace/wasl-contextual-local");
const prefix = process.env.CONTEXTUAL_LOCAL_PREFIX ?? "wasl-contextual";
if (!/^wasl-contextual(?:-[a-z0-9]+(?:-[a-z0-9]+)*)?$/.test(prefix) || prefix.length > 50) throw new Error("Invalid isolated runtime prefix");
function port(name, fallback) {
  const raw = process.env[name] ?? String(fallback);
  if (!/^\d{4,5}$/.test(raw) || Number(raw) < 1024 || Number(raw) > 65535) throw new Error(`Invalid local port setting: ${name}`);
  return Number(raw);
}
const ports = { gateway: port("CONTEXTUAL_LOCAL_GATEWAY_PORT", 55621), database: port("CONTEXTUAL_LOCAL_DATABASE_PORT", 55622), app: port("CONTEXTUAL_LOCAL_APP_PORT", 3060) };
if (new Set(Object.values(ports)).size !== 3) throw new Error("Isolated runtime ports must be distinct");
const network = `${prefix}-net`;
const accessNetwork = `${prefix}-access`;
const images = { db: "postgres:17", auth: "supabase/gotrue:v2.197.0", rest: "postgrest/postgrest:v16.4", realtime: "supabase/realtime:v2.140.3", kong: "kong:2.8.1" };
let privateValues = [];
function write(name, body) {
  const path = join(state, name);
  writeFileSync(path, body, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}
function command(args, input) {
  const result = spawnSync(args[0], args.slice(1), { input, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
  if (result.status !== 0) {
    let error = (result.stderr ?? "") + (result.stdout ?? "");
    for (const secret of privateValues) error = error.split(secret).join("[redacted]");
    throw new Error(`${args.slice(0, 3).join(" ")} failed: ${error.slice(-2000)}`);
  }
  return result.stdout.trim();
}
function sql(text) {
  return command(["docker", "exec", "-i", `${prefix}-db`, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"], text);
}
const delay = (ms) => new Promise((accept) => setTimeout(accept, ms));
async function ready(predicate, label) {
  for (let count = 0; count < 45; count++) {
    try { if (await predicate()) return; } catch { /* bounded retry */ }
    await delay(1000);
  }
  throw new Error(`${label} did not become ready`);
}
function guard() {
  if (process.env.VERIFY_ISOLATED_TEST !== "1") throw new Error("Set VERIFY_ISOLATED_TEST=1 for this disposable local runtime only");
  if (process.env.ANTHROPIC_API_KEY || process.env.ELEVENLABS_API_KEY) throw new Error("Unset paid provider keys for local recommendation checks");
  if (state === repository || state.startsWith(`${repository}/`) || !state.startsWith("/workspace/") && !state.startsWith("/tmp/")) throw new Error("State must be a private directory outside the checkout");
}
function credentials() {
  const result = JSON.parse(readFileSync(join(state, "credentials.json"), "utf8"));
  if (result.url !== `http://127.0.0.1:${ports.gateway}`) throw new Error("Synthetic credentials must target the exact loopback gateway");
  if (result.prefix && (result.prefix !== prefix || JSON.stringify(result.ports) !== JSON.stringify(ports))) throw new Error("Synthetic state belongs to a different isolated runtime");
  if (!result.prefix && (prefix !== "wasl-contextual" || ports.gateway !== 55621 || ports.database !== 55622 || ports.app !== 3060)) throw new Error("Legacy state can only use the original default runtime");
  privateValues = [result.password, result.jwt_secret, result.anon, result.service].filter((value) => typeof value === "string" && value.length > 16);
  return result;
}
function jwt(role, secret) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const payload = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ role, iss: "supabase-local-contextual", iat: now, exp: now + 86400 * 7 })}`;
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
function loadAppEnvironment() {
  const k = credentials();
  return { ...process.env, NEXT_PUBLIC_SUPABASE_URL: k.url, NEXT_PUBLIC_SUPABASE_ANON_KEY: k.anon, SUPABASE_SERVICE_ROLE_KEY: k.service,
    ANTHROPIC_API_KEY: "", ELEVENLABS_API_KEY: "", WASL_AI_TEST_SCOPE: "contextual", WASL_RECOMMENDATIONS_PAID_APPROVED: "false", WASL_RECOMMENDATIONS_TEST_BUDGET_USD: "0", NEXT_TELEMETRY_DISABLED: "1", VERIFY_BASE: `http://127.0.0.1:${ports.app}` };
}
async function setup() {
  mkdirSync(state, { recursive: true, mode: 0o700 }); chmodSync(state, 0o700);
  if (existsSync(join(state, "credentials.json"))) throw new Error("Existing local state: use migrate/start, never regenerate keys for running containers");
  for (const name of Object.keys(images)) {
    if (spawnSync("docker", ["inspect", `${prefix}-${name}`], { stdio: "ignore" }).status === 0) throw new Error(`Container collision ${prefix}-${name}`);
    command(["docker", "image", "inspect", images[name], "--format", "{{.Id}}"]);
  }
  const packages = resolve(process.env.CONTEXTUAL_LOCAL_PACKAGES ?? join(state, "packages"));
  const expected = {
    "postgresql-17-cron_1.6.5-1_amd64.deb": "e89f12020f9bd547120efb0a3bab333b117902449529205c0c69484bbd0bc9ff",
    "postgresql-17-wal2json_2.6-2+b1_amd64.deb": "70371bb2072d904ad381d29df2c50f5f2fe8c12583bc0207336b2d5772a0ac36",
  };
  for (const [filename, hash] of Object.entries(expected)) {
    if (createHash("sha256").update(readFileSync(join(packages, filename))).digest("hex") !== hash) throw new Error(`Package hash mismatch: ${filename}`);
  }
  const password = randomBytes(24).toString("hex"), secret = randomBytes(40).toString("hex");
  const k = { url: `http://127.0.0.1:${ports.gateway}`, prefix, ports, password, jwt_secret: secret, anon: jwt("anon", secret), service: jwt("service_role", secret) };
  write("credentials.json", JSON.stringify(k)); credentials();
  const env = (name, values) => write(name, Object.entries(values).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  env("db.env", { POSTGRES_PASSWORD: password });
  env("auth.env", { GOTRUE_API_HOST: "0.0.0.0", GOTRUE_API_PORT: 9999, API_EXTERNAL_URL: k.url, GOTRUE_DB_DRIVER: "postgres",
    GOTRUE_DB_DATABASE_URL: `postgres://supabase_auth_admin:${password}@${prefix}-db:5432/postgres?sslmode=disable`,
    GOTRUE_SITE_URL: `http://127.0.0.1:${ports.app}`, GOTRUE_URI_ALLOW_LIST: `http://127.0.0.1:${ports.app}/**`, GOTRUE_DISABLE_SIGNUP: false,
    GOTRUE_JWT_ADMIN_ROLES: "service_role", GOTRUE_JWT_AUD: "authenticated", GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated", GOTRUE_JWT_EXP: 3600,
    GOTRUE_JWT_SECRET: secret, GOTRUE_EXTERNAL_EMAIL_ENABLED: true, GOTRUE_EXTERNAL_ANONYMOUS_USERS_ENABLED: true, GOTRUE_MAILER_AUTOCONFIRM: true, GOTRUE_LOG_LEVEL: "warn" });
  env("rest.env", { PGRST_DB_URI: `postgres://authenticator:${password}@${prefix}-db:5432/postgres`, PGRST_DB_SCHEMAS: "public", PGRST_DB_EXTRA_SEARCH_PATH: "public,extensions", PGRST_DB_ANON_ROLE: "anon", PGRST_JWT_SECRET: secret, PGRST_DB_USE_LEGACY_GUCS: false, PGRST_LOG_LEVEL: "warn" });
  env("realtime.env", { APP_NAME: "realtime", METRICS_JWT_SECRET: secret, PORT: 4000, DB_HOST: `${prefix}-db`, DB_PORT: 5432, DB_USER: "supabase_admin", DB_PASSWORD: password,
    DB_NAME: "postgres", DB_AFTER_CONNECT_QUERY: "SET search_path TO _realtime", DB_ENC_KEY: "supabaserealtime", API_JWT_SECRET: secret, SECRET_KEY_BASE: randomBytes(48).toString("hex"),
    ERL_AFLAGS: "-proto_dist inet_tcp", DNS_NODES: "", SEED_SELF_HOST: true, RUN_JANITOR: true, RLIMIT_NOFILE: 10000, SELF_HOST_TENANT_NAME: "contextual-local" });
  write("app.env", Object.entries(loadAppEnvironment()).filter(([key]) => ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_API_KEY", "ELEVENLABS_API_KEY", "WASL_RECOMMENDATIONS_PAID_APPROVED", "WASL_RECOMMENDATIONS_TEST_BUDGET_USD", "NEXT_TELEMETRY_DISABLED", "VERIFY_BASE"].includes(key)).map(([key, value]) => `${key}=${value}`).join("\n") + "\n");
  write("kong.yml", `_format_version: "2.1"\n_transform: true\nconsumers:\n  - username: anon\n    keyauth_credentials:\n      - key: ${k.anon}\n  - username: service_role\n    keyauth_credentials:\n      - key: ${k.service}\nservices:\n  - name: auth\n    url: http://${prefix}-auth:9999/\n    routes:\n      - name: auth\n        strip_path: true\n        paths: ["/auth/v1/"]\n  - name: rest\n    url: http://${prefix}-rest:3000/\n    routes:\n      - name: rest\n        strip_path: true\n        paths: ["/rest/v1/"]\n  - name: realtime\n    url: http://contextual-local.supabase-realtime:4000/socket/\n    routes:\n      - name: realtime\n        strip_path: true\n        paths: ["/realtime/v1/"]\nplugins:\n  - name: key-auth\n    config:\n      key_names: ["apikey"]\n      hide_credentials: false\n  - name: cors\n`);
  command(["docker", "network", "create", "--internal", "--label", "wasl.contextual.local=true", network]);
  // Docker disables published ports on an exclusively --internal network. Only the
  // DB and gateway join this access bridge; API ports still bind to 127.0.0.1.
  command(["docker", "network", "create", "--label", "wasl.contextual.local=true", accessNetwork]);
  command(["docker", "run", "-d", "--name", `${prefix}-db`, "--label", "wasl.contextual.local=true", "--network", accessNetwork, "--env-file", join(state, "db.env"), "-p", `127.0.0.1:${ports.database}:5432`, images.db, "-c", "wal_level=logical", "-c", "max_replication_slots=20", "-c", "max_wal_senders=20"]);
  command(["docker", "network", "connect", network, `${prefix}-db`]);
  await ready(() => spawnSync("docker", ["exec", `${prefix}-db`, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status === 0, "database");
  for (const filename of Object.keys(expected)) command(["docker", "cp", join(packages, filename), `${prefix}-db:/tmp/${filename}`]);
  command(["docker", "exec", `${prefix}-db`, "dpkg", "--force-depends", "-i", ...Object.keys(expected).map((filename) => `/tmp/${filename}`)]);
  sql("alter system set shared_preload_libraries='pg_cron'; alter system set cron.database_name='postgres'; alter system set output_plugin_libraries to 'pgoutput', 'test_decoding', 'wal2json';");
  command(["docker", "restart", `${prefix}-db`]);
  await ready(() => spawnSync("docker", ["exec", `${prefix}-db`, "pg_isready", "-U", "postgres"], { stdio: "ignore" }).status === 0, "database restart");
  sql(`create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    create role authenticator login noinherit password '${password}'; grant anon, authenticated, service_role to authenticator;
    create role supabase_auth_admin login createrole password '${password}'; alter role supabase_auth_admin set search_path=auth,public,extensions;
    create role supabase_admin login superuser password '${password}'; create role dashboard_user nologin;
    create schema auth authorization supabase_auth_admin; create schema extensions; create schema _realtime authorization supabase_admin; create schema realtime authorization supabase_admin;
    grant usage on schema public to anon,authenticated,service_role; grant all on schema public to postgres,supabase_auth_admin,supabase_admin;
    alter default privileges for role postgres in schema public grant all on tables to anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant all on sequences to anon,authenticated,service_role;
    alter default privileges for role postgres in schema public grant all on functions to anon,authenticated,service_role;
    create publication supabase_realtime;`);
  const launch = (name, extra = []) => command(["docker", "run", "-d", "--name", `${prefix}-${name}`, "--label", "wasl.contextual.local=true", "--network", network, ...extra, "--env-file", join(state, `${name}.env`), images[name]]);
  launch("auth");
  await ready(() => Number(sql("select count(*) from auth.schema_migrations").match(/\n\s*(\d+)\s*\n/)?.[1]) >= 75, "Auth migrations");
  sql(`create or replace function auth.uid() returns uuid language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.sub',true),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')),'')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$ select nullif(coalesce(current_setting('request.jwt.claim.role',true),(nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role')),'') $$;
    create or replace function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    create or replace function auth.email() returns text language sql stable as $$ select auth.jwt()->>'email' $$;
    grant usage on schema auth to anon,authenticated,service_role; grant execute on all functions in schema auth to anon,authenticated,service_role;
    create table public.contextual_local_migrations(name text primary key, sha256 text not null);`);
  await migrate(); launch("rest"); launch("realtime", ["--network-alias", "contextual-local.supabase-realtime"]);
  command(["docker", "run", "-d", "--name", `${prefix}-kong`, "--label", "wasl.contextual.local=true", "--user", "0", "--network", accessNetwork, "-p", `127.0.0.1:${ports.gateway}:8000`, "-v", `${join(state, "kong.yml")}:/home/kong/kong.yml:ro`, "-e", "KONG_DATABASE=off", "-e", "KONG_DECLARATIVE_CONFIG=/home/kong/kong.yml", "-e", "KONG_DNS_ORDER=LAST,A,CNAME", "-e", "KONG_PLUGINS=key-auth,cors", "-e", "KONG_NGINX_PROXY_PROXY_BUFFER_SIZE=160k", "-e", "KONG_NGINX_PROXY_PROXY_BUFFERS=64 160k", images.kong]);
  command(["docker", "network", "connect", network, `${prefix}-kong`]);
  await ready(async () => (await fetch(`${k.url}/auth/v1/health`, { headers: { apikey: k.anon } })).ok, "gateway");
  await ready(() => /:(?:ok|noop)/.test(command(["docker", "exec", `${prefix}-realtime`, "/app/bin/realtime", "rpc", 'tenant = Realtime.Api.get_tenant_by_external_id("contextual-local"); IO.inspect(if tenant, do: Realtime.Tenants.Migrations.run_migrations(tenant), else: :missing)'])), "Realtime tenant migrations");
  console.log("Prepared five LOCAL containers, real Auth/REST/Realtime and repository migrations. Secrets remain outside Git.");
}
async function migrate() {
  credentials();
  if (command(["docker", "inspect", `${prefix}-db`, "--format", '{{index .Config.Labels "wasl.contextual.local"}}']) !== "true") throw new Error("Database ownership label missing");
  for (const filename of readdirSync(join(repository, "supabase/migrations")).filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
    const text = readFileSync(join(repository, "supabase/migrations", filename), "utf8");
    const hash = createHash("sha256").update(text).digest("hex");
    const previous = command(["docker", "exec", `${prefix}-db`, "psql", "-U", "postgres", "-Atc", `select sha256 from public.contextual_local_migrations where name='${filename}'`]);
    if (previous && previous !== hash) throw new Error(`Applied migration changed: ${filename}. Create a new disposable stack instead.`);
    if (previous) continue;
    sql(`begin;\n${text}\ninsert into public.contextual_local_migrations values ('${filename}','${hash}'); commit;`);
    console.log(`Applied ${filename} to owned LOCAL database`);
  }
  sql("notify pgrst, 'reload schema';");
}
async function build() {
  assertOwnedRuntime();
  const env = { ...loadAppEnvironment(), NODE_ENV: "production" };
  if (process.env.CONTEXTUAL_LOCAL_FONT_RESPONSES) env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = resolve(process.env.CONTEXTUAL_LOCAL_FONT_RESPONSES);
  const child = spawnSync(process.execPath, [join(repository, "node_modules/next/dist/bin/next"), "build", "--webpack"], { cwd: repository, env, stdio: "inherit" });
  process.exitCode = child.status ?? 1;
}
async function start(production = false) {
  assertOwnedRuntime();
  const env = loadAppEnvironment();
  if (process.env.CONTEXTUAL_LOCAL_FONT_RESPONSES) env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES = resolve(process.env.CONTEXTUAL_LOCAL_FONT_RESPONSES);
  if (production) env.NODE_ENV = "production";
  const child = spawn(process.execPath, [join(repository, "node_modules/next/dist/bin/next"), production ? "start" : "dev", ...(production ? [] : ["--webpack"]), "--hostname", "127.0.0.1", "--port", String(ports.app)], { cwd: repository, env, stdio: "inherit", detached: true });
  for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => {
    try { process.kill(-child.pid, signal); } catch { /* child already stopped */ }
  });
  child.on("exit", (status) => { process.exitCode = status ?? 1; });
}
function assertOwnedRuntime() {
  for (const name of ["db", "kong"]) {
    if (command(["docker", "inspect", `${prefix}-${name}`, "--format", '{{index .Config.Labels "wasl.contextual.local"}}']) !== "true") throw new Error("Owned LOCAL runtime label missing");
  }
}
guard();
const action = process.argv[2];
try {
  if (action === "setup") await setup();
  else if (action === "migrate") await migrate();
  else if (action === "start") await start();
  else if (action === "build") await build();
  else if (action === "start-production") await start(true);
  else if (action === "environment") console.log("Private app.env is available in the isolated state directory; credential values are never printed.");
  else throw new Error("Usage: VERIFY_ISOLATED_TEST=1 node scripts/dev/contextual-local.mjs setup|migrate|build|start|start-production|environment");
} catch (error) { console.error(error.message); process.exitCode = 1; }
