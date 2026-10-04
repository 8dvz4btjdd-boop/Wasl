"use server";

import { randomInt } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { routing } from "@/i18n/routing";
import { getStaff } from "@/lib/auth/dal";
import { TOPICS } from "@/lib/chat/types";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";

type Result = { ok: true } | { ok: false; error: "invalidInput" | "emailTaken" | "generic" };

async function requireAdmin() {
  const staff = await getStaff();
  return staff?.role === "admin" ? staff : null;
}

async function adminOrgId(userId: string) {
  const { data } = await createServiceClient().from("profiles").select("org_id").eq("user_id", userId).single();
  return data?.org_id ?? null;
}

const Language = z.enum(routing.locales);
const DaeeFields = z.object({
  languages: z.array(Language).min(1),
  topics: z.array(z.enum(TOPICS)),
  capacity: z.number().int().min(1).max(20),
});

// Readable, unambiguous; shown to the admin once and never stored or logged in plain form.
const PASSWORD_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function temporaryPassword(length = 14) {
  return Array.from({ length }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join("");
}

const CreateInput = DaeeFields.extend({
  email: z.email(),
  displayName: z.string().trim().min(1).max(60),
});

export async function createDaee(
  input: z.input<typeof CreateInput>,
): Promise<{ ok: true; password: string } | Extract<Result, { ok: false }>> {
  const admin = await requireAdmin();
  const parsed = CreateInput.safeParse(input);
  if (!admin || !parsed.success) return { ok: false, error: "invalidInput" };
  const { email, displayName, languages, topics, capacity } = parsed.data;

  const service = createServiceClient();
  const orgId = await adminOrgId(admin.user_id);
  const password = temporaryPassword();
  const { data, error } = await service.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) {
    if (error?.code === "email_exists") return { ok: false, error: "emailTaken" };
    logServerError("createDaee.createUser", error);
    return { ok: false, error: "generic" };
  }
  const { error: profileError } = await service.from("profiles").insert({
    user_id: data.user.id,
    org_id: orgId!,
    role: "daee",
    display_name: displayName,
    languages,
    topics,
    capacity,
    status: "offline",
  });
  if (profileError) {
    logServerError("createDaee.insertProfile", profileError, { userId: data.user.id });
    await service.auth.admin.deleteUser(data.user.id);
    return { ok: false, error: "generic" };
  }
  revalidatePath("/[locale]/admin/team", "page");
  return { ok: true, password };
}

const UpdateInput = DaeeFields.extend({ userId: z.uuid() });

/** Routing reads profiles on every assignment, so changes apply immediately. */
export async function updateDaee(input: z.input<typeof UpdateInput>): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = UpdateInput.safeParse(input);
  if (!admin || !parsed.success) return { ok: false, error: "invalidInput" };
  const { userId, languages, topics, capacity } = parsed.data;
  const { error } = await createServiceClient()
    .from("profiles")
    .update({ languages, topics, capacity })
    .eq("user_id", userId)
    .eq("role", "daee");
  if (error) {
    logServerError("updateDaee", error, { userId });
    return { ok: false, error: "generic" };
  }
  revalidatePath("/[locale]/admin/team", "page");
  return { ok: true };
}

const ActiveInput = z.object({ userId: z.uuid(), active: z.boolean() });

/** Deactivating bans sign-in and sets the daee offline; routing skips them at once (is_active_staff). */
export async function setDaeeActive(input: z.input<typeof ActiveInput>): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = ActiveInput.safeParse(input);
  if (!admin || !parsed.success) return { ok: false, error: "invalidInput" };
  const { userId, active } = parsed.data;
  const service = createServiceClient();
  const { data: target } = await service.from("profiles").select("role").eq("user_id", userId).maybeSingle();
  if (target?.role !== "daee") return { ok: false, error: "invalidInput" };

  const { error } = await service.auth.admin.updateUserById(userId, { ban_duration: active ? "none" : "876000h" });
  if (error) {
    logServerError("setDaeeActive.ban", error, { userId, active });
    return { ok: false, error: "generic" };
  }
  if (!active) {
    const { error: offlineError } = await service.from("profiles").update({ status: "offline" }).eq("user_id", userId);
    if (offlineError) logServerError("setDaeeActive.offline", offlineError, { userId });
    // Their open conversations go back to the queue (and are re-routed) right away.
    const { error: releaseError } = await service.rpc("release_daee_conversations", { d: userId });
    if (releaseError) logServerError("setDaeeActive.release", releaseError, { userId });
  }
  revalidatePath("/[locale]/admin/team", "page");
  return { ok: true };
}

const SettingsInput = z.object({
  name: z.string().trim().min(1).max(120),
  languages: z.array(Language).min(1),
  waitAlertMinutes: z.number().int().min(1).max(240),
});

export async function updateSettings(input: z.input<typeof SettingsInput>): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = SettingsInput.safeParse(input);
  if (!admin || !parsed.success) return { ok: false, error: "invalidInput" };
  const orgId = await adminOrgId(admin.user_id);
  // As the admin: org_admin RLS allows the update.
  const supabase = await createClient();
  const { error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name, languages: parsed.data.languages, wait_alert_minutes: parsed.data.waitAlertMinutes })
    .eq("id", orgId!);
  if (error) {
    logServerError("updateSettings", error);
    return { ok: false, error: "generic" };
  }
  // The asker landing page shows the organization name.
  revalidatePath("/[locale]", "page");
  revalidatePath("/[locale]/admin/settings", "page");
  return { ok: true };
}

export async function setAiEnabled(enabled: boolean): Promise<Result> {
  const admin = await requireAdmin();
  if (!admin || typeof enabled !== "boolean") return { ok: false, error: "invalidInput" };
  const orgId = await adminOrgId(admin.user_id);
  const supabase = await createClient();
  const { error } = await supabase.from("organizations").update({ ai_enabled: enabled }).eq("id", orgId!);
  if (error) {
    logServerError("setAiEnabled", error, { enabled });
    return { ok: false, error: "generic" };
  }
  // Events are admin-read-only in RLS; written with the service client.
  const { error: eventError } = await createServiceClient()
    .from("events")
    .insert({ org_id: orgId!, type: "ai_toggled", actor_role: "admin", meta: { enabled } });
  if (eventError) logServerError("setAiEnabled.event", eventError);
  revalidatePath("/[locale]/admin/settings", "page");
  return { ok: true };
}
