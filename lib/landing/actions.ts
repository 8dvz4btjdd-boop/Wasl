"use server";

import { z } from "zod";
import { createClient } from "@/lib/db/server";
import { logServerError } from "@/lib/log";
import { routing } from "@/i18n/routing";

const Language = z.enum(routing.locales);

/** How many daee are available now in a language, for the public landing page. Counts only. */
export async function getAvailability(language: string): Promise<number> {
  const parsed = Language.safeParse(language);
  if (!parsed.success) return 0;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("public_availability", { p_language: parsed.data });
  if (error) {
    logServerError("landing.availability", error);
    return 0;
  }
  return data ?? 0;
}
