import { createBrowserClient } from "@supabase/ssr";
import type { RealtimeChannel } from "@supabase/supabase-js";
import type { Database } from "./types";

type BrowserClient = ReturnType<typeof createBrowserClient<Database>>;

let client: BrowserClient | undefined;
let authReady: Promise<void> | undefined;

/** One browser client per tab, so Realtime shares a single socket. */
export function createClient() {
  client ??= createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
  return client;
}

/**
 * Resolves once Realtime carries the user's token. Without this, the first channel can
 * join before the session is read from cookies, i.e. as the anon key, and RLS then
 * silently hides every row from it. Also keeps the token current after refreshes.
 */
function realtimeAuthReady(supabase: BrowserClient) {
  authReady ??= (() => {
    supabase.auth.onAuthStateChange((event, session) => {
      if (event === "TOKEN_REFRESHED" && session) void supabase.realtime.setAuth(session.access_token);
    });
    return supabase.auth.getSession().then(() => supabase.realtime.setAuth());
  })();
  return authReady;
}

const POLL_MS = 10_000;
const MAX_BACKOFF_MS = 30_000;
const FAILED = new Set(["CLOSED", "CHANNEL_ERROR", "TIMED_OUT"]);

type ResilientOptions = {
  /** Readable prefix for the channel topic. */
  name: string;
  /** Adds the `.on(...)` listeners to a fresh channel. */
  configure: (channel: RealtimeChannel) => RealtimeChannel;
  /** Re-fetches whatever the channel feeds; runs on every (re)subscribe and while polling. */
  onResync: () => void | Promise<void>;
};

/**
 * A Realtime subscription that heals itself:
 * - resubscribes with exponential backoff after CLOSED / CHANNEL_ERROR / TIMED_OUT;
 * - resyncs on every SUBSCRIBED, so nothing missed while disconnected is lost;
 * - polls `onResync` every 10s while not subscribed;
 * - resyncs when the tab becomes visible again.
 * Returns the cleanup for useEffect.
 */
export function subscribeResilient({ name, configure, onResync }: ResilientOptions): () => void {
  const supabase = createClient();
  let disposed = false;
  let channel: RealtimeChannel | undefined;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let pollTimer: ReturnType<typeof setInterval> | undefined;

  const resync = () => void Promise.resolve(onResync()).catch(() => {});
  const startPolling = () => {
    pollTimer ??= setInterval(resync, POLL_MS);
  };
  const stopPolling = () => {
    clearInterval(pollTimer);
    pollTimer = undefined;
  };

  const connect = () => {
    if (disposed) return;
    // A unique topic per attempt: supabase-js reuses channels by topic, and the old one may still be closing.
    const current = configure(supabase.channel(`${name}:${crypto.randomUUID().slice(0, 8)}`));
    channel = current;
    current.subscribe((status) => {
      if (disposed || channel !== current) return;
      if (status === "SUBSCRIBED") {
        attempt = 0;
        stopPolling();
        resync();
      } else if (FAILED.has(status)) {
        channel = undefined;
        void supabase.removeChannel(current);
        startPolling();
        resync();
        retryTimer = setTimeout(connect, Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attempt++));
      }
    });
  };

  const onVisible = () => {
    if (document.visibilityState === "visible") resync();
  };
  document.addEventListener("visibilitychange", onVisible);
  startPolling();
  void realtimeAuthReady(supabase).then(connect);

  return () => {
    disposed = true;
    clearTimeout(retryTimer);
    stopPolling();
    document.removeEventListener("visibilitychange", onVisible);
    if (channel) void supabase.removeChannel(channel);
  };
}
