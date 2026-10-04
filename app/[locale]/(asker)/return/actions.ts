"use server";

import { z } from "zod";
import { redirect } from "@/i18n/navigation";
import { type FormState, LocaleField, Pseudonym } from "@/lib/auth/forms";
import { verifyReturnCode } from "@/lib/auth/return-code";
import { getDefaultOrg } from "@/lib/db/queries/org";
import { createClient } from "@/lib/db/server";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";

const Input = z.object({
  locale: LocaleField,
  pseudonym: z.string(),
  code: z.string().trim().min(1).max(32),
});

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, "\\$&");
}

function minutesUntil(iso: string) {
  return Math.max(1, Math.ceil((Date.parse(iso) - Date.now()) / 60_000));
}

export async function returnAsker(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = Input.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "returnFailed" };
  const { locale, code } = parsed.data;
  const pseudonym = Pseudonym.safeParse(parsed.data.pseudonym);
  if (!pseudonym.success) return { error: "returnFailed" };

  let org: Awaited<ReturnType<typeof getDefaultOrg>>;
  try {
    org = await getDefaultOrg();
  } catch (error) {
    logServerError("returnAsker.getDefaultOrg", error);
    return { error: "generic" };
  }
  const key = pseudonym.data.toLowerCase();
  const service = createServiceClient();

  // Rate limit per pseudonym, applied whether or not the pseudonym exists.
  const { data: attempts, error: attemptsError } = await service
    .from("return_attempts")
    .select("locked_until")
    .eq("org_id", org.id)
    .eq("pseudonym_key", key)
    .maybeSingle();
  if (attemptsError) {
    logServerError("returnAsker.readAttempts", attemptsError);
    return { error: "generic" };
  }
  if (attempts?.locked_until && Date.parse(attempts.locked_until) > Date.now()) {
    return { error: "locked", minutes: minutesUntil(attempts.locked_until) };
  }

  const { data: asker, error: askerError } = await service
    .from("askers")
    .select("user_id, return_code_hash")
    .eq("org_id", org.id)
    .ilike("pseudonym", escapeLike(pseudonym.data))
    .maybeSingle();
  if (askerError) {
    logServerError("returnAsker.findAsker", askerError);
    return { error: "generic" };
  }

  if (!asker || !verifyReturnCode(code, org.return_code_salt, asker.return_code_hash)) {
    const { data: lockedUntil, error: failError } = await service.rpc("record_return_failure", {
      p_org: org.id,
      p_key: key,
    });
    if (failError) logServerError("returnAsker.recordFailure", failError);
    if (lockedUntil) return { error: "locked", minutes: minutesUntil(lockedUntil) };
    return { error: "returnFailed" };
  }

  // Use the current session only if it is anonymous and owns no asker; otherwise start fresh.
  const supabase = await createClient();
  const { data: current } = await supabase.auth.getUser();
  if (current.user?.id === asker.user_id) return redirect({ href: "/wait", locale });

  let newUserId = current.user?.is_anonymous ? current.user.id : undefined;
  if (newUserId) {
    const { data: owned, error } = await service
      .from("askers")
      .select("user_id")
      .eq("user_id", newUserId)
      .maybeSingle();
    if (error) {
      logServerError("returnAsker.checkCurrentSession", error);
      return { error: "generic" };
    }
    if (owned) newUserId = undefined;
  }
  if (!newUserId) {
    if (current.user) {
      const { error } = await supabase.auth.signOut();
      if (error) logServerError("returnAsker.signOut", error);
    }
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error || !data.user) {
      logServerError("returnAsker.signInAnonymously", error ?? "no user returned");
      return { error: "generic" };
    }
    newUserId = data.user.id;
  }

  const { error: relinkError } = await service.rpc("relink_asker", {
    old_id: asker.user_id,
    new_id: newUserId,
  });
  if (relinkError) {
    logServerError("returnAsker.relink", relinkError, { oldId: asker.user_id, newId: newUserId });
    return { error: "generic" };
  }

  // Cleanup failures don't block the person; they're only logged.
  const { error: clearError } = await service
    .from("return_attempts")
    .delete()
    .eq("org_id", org.id)
    .eq("pseudonym_key", key);
  if (clearError) logServerError("returnAsker.clearAttempts", clearError);

  // The previous anonymous auth user owns nothing now; remove it.
  const { data: oldUser, error: getError } = await service.auth.admin.getUserById(asker.user_id);
  if (getError) logServerError("returnAsker.getOldUser", getError, { oldId: asker.user_id });
  if (oldUser.user?.is_anonymous) {
    const { error } = await service.auth.admin.deleteUser(asker.user_id);
    if (error) logServerError("returnAsker.deleteOldUser", error, { oldId: asker.user_id });
  }

  return redirect({ href: "/wait", locale });
}
