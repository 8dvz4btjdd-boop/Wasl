"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { getSessionUser, getStaff, STAFF_HOME } from "@/lib/auth/dal";
import { BACKGROUND_MAX, type FormState, LocaleField, Pseudonym } from "@/lib/auth/forms";
import { generateReturnCode, hashReturnCode } from "@/lib/auth/return-code";
import { getDefaultOrg } from "@/lib/db/queries/org";
import { createClient } from "@/lib/db/server";
import { logServerError } from "@/lib/log";

export type EnterState = FormState & { code?: string; pseudonym?: string };

const Input = z.object({
  locale: LocaleField,
  pseudonym: z.string(),
  background: z.string().trim().optional(),
  skip: z.string().optional(),
});

export async function createAsker(_prev: EnterState, formData: FormData): Promise<EnterState> {
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "invalidInput" };
  const { locale } = parsed.data;
  const background = parsed.data.skip ? undefined : parsed.data.background;

  const pseudonym = Pseudonym.safeParse(parsed.data.pseudonym);
  if (!pseudonym.success) return { error: "pseudonymInvalid" };
  if (background && background.length > BACKGROUND_MAX) return { error: "backgroundTooLong" };

  const staff = await getStaff();
  if (staff) return redirect({ href: STAFF_HOME[staff.role], locale });

  // The org id and salt are read with the service client; the asker never sees the salt.
  let org: Awaited<ReturnType<typeof getDefaultOrg>>;
  try {
    org = await getDefaultOrg();
  } catch (error) {
    logServerError("createAsker.getDefaultOrg", error);
    return { error: "generic" };
  }

  // Reuse an anonymous session that has no asker yet (e.g. after a taken pseudonym).
  const supabase = await createClient();
  let userId = (await getSessionUser())?.id;
  if (userId) {
    const { data: existing, error } = await supabase
      .from("askers")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      logServerError("createAsker.findExisting", error, { userId });
      return { error: "generic" };
    }
    if (existing) return redirect({ href: "/wait", locale });
  } else {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      logServerError("createAsker.signInAnonymously", error ?? "no user returned");
      return { error: "generic" };
    }
    userId = data.user.id;
  }

  const code = generateReturnCode();
  const { error } = await supabase.from("askers").insert({
    user_id: userId,
    org_id: org.id,
    pseudonym: pseudonym.data,
    background: background || null,
    language: locale,
    return_code_hash: hashReturnCode(code, org.return_code_salt),
  });
  if (error) {
    if (error.code === "23505") return { error: "pseudonymTaken" };
    logServerError("createAsker.insertAsker", error, { userId });
    return { error: "generic" };
  }

  // Shown once by the client. Never stored or logged in plain form.
  return { code, pseudonym: pseudonym.data };
}
