import "server-only";
import { cache } from "react";
import { redirect } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { createClient } from "@/lib/db/server";
import type { Database } from "@/lib/db/types";
import { logServerError } from "@/lib/log";

// Auth checks live here and are called from every protected page and action.
// Not in layouts: they don't re-run on client navigation (Next 16 auth guide).

export type StaffRole = Database["public"]["Enums"]["user_role"];

export const STAFF_HOME: Record<StaffRole, "/admin" | "/daee"> = {
  admin: "/admin",
  daee: "/daee",
};

export const getSessionUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  // No session is normal for visitors; anything else is worth seeing.
  if (error && error.name !== "AuthSessionMissingError") logServerError("dal.getSessionUser", error);
  return data.user;
});

export const getStaff = cache(async () => {
  const user = await getSessionUser();
  if (!user || user.is_anonymous) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, role, display_name")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) logServerError("dal.getStaff", error, { userId: user.id });
  return data;
});

export const getAsker = cache(async () => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("askers")
    .select("user_id, pseudonym, language")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) logServerError("dal.getAsker", error, { userId: user.id });
  return data;
});

/** Staff with exactly `role`. Others go to their own home or to login. */
export async function requireStaff(locale: Locale, role: StaffRole) {
  const staff = await getStaff();
  if (!staff) return redirect({ href: "/login", locale });
  if (staff.role !== role) return redirect({ href: STAFF_HOME[staff.role], locale });
  return staff;
}

/** A session with an asker row. Everyone else goes to enter. */
export async function requireAsker(locale: Locale) {
  const asker = await getAsker();
  if (!asker) return redirect({ href: "/enter", locale });
  return asker;
}
