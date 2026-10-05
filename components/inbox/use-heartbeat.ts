"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/db/client";
import type { Presence } from "@/lib/chat/types";

const BEAT_MS = 30_000;

/**
 * Keeps this daee's presence true: every 30 s (and when the tab comes back) the workspace
 * checks in. The server treats 90 s without a beat as offline, so a closed tab or lost
 * connection never leaves anyone "available"; coming back after that starts offline.
 */
export function usePresenceHeartbeat(onStatus: (status: Presence) => void) {
  const callback = useRef(onStatus);
  useEffect(() => {
    callback.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    const supabase = createClient();
    let active = true;
    const beat = async () => {
      const { data, error } = await supabase.rpc("presence_heartbeat");
      if (active && !error && data) callback.current(data);
    };
    void beat();
    const timer = window.setInterval(beat, BEAT_MS);
    const onVisible = () => document.visibilityState === "visible" && void beat();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      active = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);
}
