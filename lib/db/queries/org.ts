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
