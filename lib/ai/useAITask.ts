"use client";

import { useCallback, useRef, useState } from "react";

export type AIState = "idle" | "thinking" | "streaming" | "done" | "fallback";
export type AIMetaClient = { model: string; tier: "fast" | "card"; latencyMs: number };

/**
 * Runs an AI task route that streams NDJSON ({ type: partial | done | fallback }).
 * Exposes the partial object while the model writes, then the validated result.
 */
export function useAITask<O>(url: string) {
  const [state, setState] = useState<AIState>("idle");
  const [partial, setPartial] = useState<Partial<O> | null>(null);
  const [data, setData] = useState<O | null>(null);
  const [meta, setMeta] = useState<AIMetaClient | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);

  const run = useCallback(
    async (body: unknown) => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      setState("thinking");
      setPartial(null);
      setData(null);
      setMeta(null);
      setReason(null);
      const fail = (why: string) => {
        setReason(why);
        setState("fallback");
      };
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) return fail("error");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let newline: number;
          while ((newline = buffer.indexOf("\n")) >= 0) {
            const line = buffer.slice(0, newline).trim();
            buffer = buffer.slice(newline + 1);
            if (!line) continue;
            const event = JSON.parse(line) as { type: string; data?: O; meta?: AIMetaClient; reason?: string };
            if (event.type === "partial") {
              setPartial(event.data as Partial<O>);
              setState("streaming");
            } else if (event.type === "done" && event.data) {
              setData(event.data);
              setMeta(event.meta ?? null);
              setState("done");
              return;
            } else if (event.type === "fallback") {
              return fail(event.reason ?? "error");
            }
          }
        }
        fail("error");
      } catch (error) {
        if (!controller.signal.aborted) fail(error instanceof Error ? error.name : "error");
      }
    },
    [url],
  );

  return { state, partial, data, meta, reason, run };
}
