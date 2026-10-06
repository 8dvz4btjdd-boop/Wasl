"use server";

import { getAsker } from "@/lib/auth/dal";
import { generateReturnCode, hashReturnCode } from "@/lib/auth/return-code";
import { getDefaultOrg } from "@/lib/db/queries/org";
import { createServiceClient } from "@/lib/db/service";
import { logServerError } from "@/lib/log";

/**
 * A new return code for the signed-in asker. Only the hash is stored (it replaces the old
 * one, so the old code stops working); the code itself is returned once and never logged.
 * The hash column isn't writable by askers, hence the service client, scoped to this asker.
 */
export async function issueNewReturnCode(): Promise<{ ok: true; code: string; replacedShown: boolean } | { ok: false }> {
  const asker = await getAsker();
  if (!asker) return { ok: false };
  const org = await getDefaultOrg();
  const code = generateReturnCode();
  const service = createServiceClient();
  const { data: row } = await service.from("askers").select("codes_revealed").eq("user_id", asker.user_id).single();
  const shownBefore = row?.codes_revealed ?? 0;
  const { error } = await service
    .from("askers")
    .update({ return_code_hash: hashReturnCode(code, org.return_code_salt), codes_revealed: shownBefore + 1 })
    .eq("user_id", asker.user_id);
  if (error) {
    logServerError("issueNewReturnCode", error, { userId: asker.user_id });
    return { ok: false };
  }
  // The previous code stops working; it only matters to say so if one was ever shown.
  return { ok: true, code, replacedShown: shownBefore > 0 };
}
