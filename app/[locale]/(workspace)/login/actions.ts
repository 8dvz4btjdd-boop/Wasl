"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { STAFF_HOME } from "@/lib/auth/dal";
import { type FormState, LocaleField } from "@/lib/auth/forms";
import { createClient } from "@/lib/db/server";
import { logServerError } from "@/lib/log";

const Input = z.object({
  locale: LocaleField,
  email: z.email(),
  password: z.string().min(1),
});

export async function signInStaff(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };
  const { locale, email, password } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    // Wrong credentials are expected; anything else is a real failure worth seeing.
    if (error?.code !== "invalid_credentials") logServerError("signInStaff.signIn", error, { email });
    return { error: "credentials" };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", data.user.id)
    .maybeSingle();
  if (profileError) {
    logServerError("signInStaff.readProfile", profileError, { userId: data.user.id });
    await supabase.auth.signOut();
    return { error: "generic" };
  }
  if (!profile) {
    await supabase.auth.signOut();
    return { error: "notStaff" };
  }

  return redirect({ href: STAFF_HOME[profile.role], locale });
}
