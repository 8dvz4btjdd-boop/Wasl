import "server-only";
import { cache } from "react";
import { createServiceClient } from "@/lib/db/service";

/** The single organization (multi-org is out of scope): the oldest one. Includes the salt, so server only. */
export const getDefaultOrg = cache(async () => {
  const { data, error } = await createServiceClient()
    .from("organizations")
    .select("id, return_code_salt")
    .order("created_at")
    .limit(1)
    .single();
  if (error) throw new Error(`No organization found: ${error.message}`);
  return data;
});

/**
 * The organization's public name for the asker landing page. Visitors aren't signed in
 * (and RLS hides organizations from them), so it's read server-side without the salt.
 */
export const getOrgName = cache(async (): Promise<string | null> => {
  const { data } = await createServiceClient()
    .from("organizations")
    .select("name")
    .order("created_at")
    .limit(1)
    .maybeSingle();
  return data?.name ?? null;
});

/** The organization's AI switch, for pages askers see (organizations is hidden from them). */
export const getAIEnabled = cache(async (): Promise<boolean> => {
  const { data } = await createServiceClient().from("organizations").select("ai_enabled").order("created_at").limit(1).maybeSingle();
  return data?.ai_enabled ?? false;
});
