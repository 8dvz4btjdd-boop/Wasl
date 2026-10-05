"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/chat/types";
import {
  ContextualRecommendationController,
  RecommendationRequestError,
  type RecommendationClientState,
} from "@/lib/recommendations/client-controller";
import { chooseNeed } from "@/lib/recommendations/triggers";
import type { RecommendationAudience, RecommendationResult } from "@/lib/recommendations/types";

export function useContextualRecommendations({
  conversationId, messages, audience, locale, enabled,
}: {
  conversationId: string;
  messages: ChatMessage[];
  audience: RecommendationAudience;
  locale: string;
  enabled: boolean;
}) {
  const [state, setState] = useState<RecommendationClientState>({ phase: "idle", result: null, error: null });
  const need = chooseNeed(messages);
  const contextVersion = need?.id ?? null;
  const controller = useRef<ContextualRecommendationController | null>(null);
  useEffect(() => {
    const instance = new ContextualRecommendationController({
    onChange: setState,
    request: async (request, signal) => {
      // Only identifiers cross this boundary. The server loads permitted, saved context itself.
      const response = await fetch(`/api/recommendations/${audience}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(request),
        signal,
      });
      if (response.status === 429) {
        const retry = await response.json().catch(() => null) as { retryAfterMs?: number } | null;
        throw new RecommendationRequestError("retry_later", typeof retry?.retryAfterMs === "number" ? retry.retryAfterMs : 20_000);
      }
      if (!response.ok) throw new RecommendationRequestError(
        response.status === 401 || response.status === 403 || response.status === 404 ? "access" : "unavailable",
      );
      return await response.json() as RecommendationResult;
    },
    });
    controller.current = instance;
    return () => instance.dispose();
  }, [audience]);

  useEffect(() => {
    controller.current?.update({ conversationId, contextVersion, locale, enabled });
  }, [audience, conversationId, contextVersion, locale, enabled]);

  return {
    ...state,
    contextVersion,
    refresh: () => controller.current?.manual("refresh"),
    expand: () => controller.current?.manual("expand"),
  };
}
