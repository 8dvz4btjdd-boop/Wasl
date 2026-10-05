"use server";

import { redirect } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";
import { LocaleField } from "@/lib/auth/forms";
import { createClient } from "@/lib/db/server";
import { logServerError } from "@/lib/log";

/** Signing out needs no role; any session (or none) may end itself. */
export async function signOut(formData: FormData) {
  const locale = LocaleField.catch(routing.defaultLocale).parse(formData.get("locale"));
  const requested = formData.get("to");
  const to = requested === "/login" || requested === "/enter" ? requested : "/";
  const supabase = await createClient();
  // A daee who signs out is offline at once (set_presence refuses anyone else; ignored).
  const { data: claims } = await supabase.auth.getClaims();
  if (claims?.claims && !claims.claims.is_anonymous) await supabase.rpc("set_presence", { p_status: "offline" });
  const { error } = await supabase.auth.signOut();
  if (error) logServerError("signOut", error);
  redirect({ href: to, locale });
}
