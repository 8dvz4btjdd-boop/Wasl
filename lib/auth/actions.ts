"use server";

import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LocaleField } from "@/lib/auth/forms";
import { createClient } from "@/lib/db/server";
import { logServerError } from "@/lib/log";

/** Signing out needs no role; any session (or none) may end itself. */
export async function signOut(formData: FormData) {
  const locale = LocaleField.catch(routing.defaultLocale).parse(formData.get("locale"));
  const to = formData.get("to") === "/login" ? "/login" : "/";
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logServerError("signOut", error);
  redirect({ href: to, locale });
}
