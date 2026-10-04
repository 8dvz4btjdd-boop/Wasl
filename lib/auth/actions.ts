"use server";

import { redirect } from "@/i18n/navigation";
import { LocaleField } from "@/lib/auth/forms";
import { createClient } from "@/lib/db/server";
import { logServerError } from "@/lib/log";

export async function signOut(formData: FormData) {
  const locale = LocaleField.parse(formData.get("locale"));
  const to = formData.get("to") === "/login" ? "/login" : "/";
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();
  if (error) logServerError("signOut", error);
  redirect({ href: to, locale });
}
