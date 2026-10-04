import "server-only";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";
import { rangeBounds, type Range } from "./range";
import type { AiHealth, AiRunRow, Alerts, ComparisonRow, EventRow, Kpis, OpsSnapshot, OrgSettings, TeamMember } from "./types";

// Every read here runs as the signed-in admin; the SQL functions check is_admin() and
// return aggregates only. Pages call requireStaff(locale, "admin") first.

export async function getOverview(range: Range) {
  const supabase = await createClient();
  const { from, to } = rangeBounds(range);
  const [ops, alerts, kpis, comparison, ai] = await Promise.all([
    supabase.rpc("admin_ops_snapshot"),
    supabase.rpc("admin_alerts", {}),
    supabase.rpc("admin_kpis", { p_from: from, p_to: to }),
    supabase.rpc("admin_comparison", { p_from: from, p_to: to }),
    supabase.rpc("admin_ai_health", { p_from: from, p_to: to }),
  ]);
  for (const [name, r] of Object.entries({ ops, alerts, kpis, comparison, ai })) {
    if (r.error) logServerError(`getOverview.${name}`, r.error);
  }
  return {
    ops: ops.data as unknown as OpsSnapshot | null,
    alerts: alerts.data as unknown as Alerts | null,
    kpis: kpis.data as unknown as Kpis | null,
    comparison: (comparison.data as unknown as ComparisonRow[] | null) ?? [],
    ai: ai.data as unknown as AiHealth | null,
  };
}

/**
 * Daee with their live load. Emails and deactivation come from Auth (service client);
 * load is a count of open conversations, never their content.
 */
export async function getTeam(): Promise<TeamMember[]> {
  const supabase = await createClient();
  const service = createServiceClient();
  const [profiles, open, users] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name, languages, topics, capacity, status")
      .eq("role", "daee")
      .order("created_at"),
    supabase.from("conversations").select("daee_id").in("status", ["waiting", "active"]).not("daee_id", "is", null),
    service.auth.admin.listUsers({ perPage: 1000 }),
  ]);
  if (profiles.error) logServerError("getTeam.profiles", profiles.error);
  if (open.error) logServerError("getTeam.load", open.error);
  if (users.error) logServerError("getTeam.users", users.error);

  const load = new Map<string, number>();
  for (const row of open.data ?? []) load.set(row.daee_id!, (load.get(row.daee_id!) ?? 0) + 1);
  const auth = new Map((users.data?.users ?? []).map((u) => [u.id, u]));
  const now = Date.now();

  return (profiles.data ?? []).map((p) => {
    const user = auth.get(p.user_id);
    const bannedUntil = user?.banned_until ? Date.parse(user.banned_until) : 0;
    return { ...p, email: user?.email ?? null, open: load.get(p.user_id) ?? 0, active: bannedUntil <= now };
  });
}

export const LOG_LIMIT = 200;

export async function getEvents(type: string | null): Promise<{ rows: EventRow[]; types: string[] }> {
  const supabase = await createClient();
  let query = supabase
    .from("events")
    .select("id, type, created_at, conversation_id, actor_role")
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT);
  if (type) query = query.eq("type", type);
  const [rows, types] = await Promise.all([query, supabase.from("events").select("type").limit(5000)]);
  if (rows.error) logServerError("getEvents", rows.error);
  return { rows: rows.data ?? [], types: [...new Set((types.data ?? []).map((t) => t.type))].sort() };
}

export async function getAiRuns(task: string | null): Promise<{ rows: AiRunRow[]; tasks: string[] }> {
  const supabase = await createClient();
  // Explicit columns: output is not readable by client roles (0004_admin.sql).
  let query = supabase
    .from("ai_runs")
    .select("id, task, model, latency_ms, fallback, reason, created_at")
    .order("created_at", { ascending: false })
    .limit(LOG_LIMIT);
  if (task) query = query.eq("task", task);
  const [rows, tasks] = await Promise.all([query, supabase.from("ai_runs").select("task").limit(5000)]);
  if (rows.error) logServerError("getAiRuns", rows.error);
  return { rows: rows.data ?? [], tasks: [...new Set((tasks.data ?? []).map((t) => t.task))].sort() };
}

export async function getSettings(): Promise<OrgSettings | null> {
  const supabase = await createClient();
  const { data: me } = await supabase.auth.getUser();
  const { data: profile } = await supabase.from("profiles").select("org_id").eq("user_id", me.user?.id ?? "").maybeSingle();
  if (!profile) return null;
  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, languages, ai_enabled, wait_alert_minutes")
    .eq("id", profile.org_id)
    .single();
  if (error) logServerError("getSettings", error);
  return data;
}
