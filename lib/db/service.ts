import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Bypasses RLS. Only for server code that must: admin user creation, seed, KPI aggregation.
export function createServiceClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
