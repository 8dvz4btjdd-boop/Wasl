import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "./types";

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let client: BrowserClient | undefined;
let realtimeAuth: Promise<void> | undefined;

/** One browser client per tab, so Realtime shares a single socket. */
export function createClient() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}

/**
 * Subscribes once Realtime carries the user's token. Without this, the first channel
 * can join before the session is read from cookies, i.e. as the anon key, and RLS then
 * silently hides every row from it. Returns the cleanup for useEffect.
 */
export function subscribeWhenReady(build: (supabase: BrowserClient) => RealtimeChannel): () => void {
  const supabase = createClient();
  realtimeAuth ??= supabase.auth.getSession().then(() => supabase.realtime.setAuth());
  let channel: RealtimeChannel | undefined;
  let cancelled = false;
  void realtimeAuth.then(() => {
    if (!cancelled) channel = build(supabase);
  });
  return () => {
    cancelled = true;
    if (channel) void supabase.removeChannel(channel);
  };
}
