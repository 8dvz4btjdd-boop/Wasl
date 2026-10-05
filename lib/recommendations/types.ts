export type RecommendationAudience = "asker" | "daee";
export type RecommendationMode = "automatic" | "refresh" | "expand";
export type RecommendationStatus = "sufficient" | "partial" | "needs_clarification" | "unavailable" | "refer" | "disabled" | "unchanged" | "pending";
export type SourceRecommendation = {
  id: string; sourceId: string; title: string; sourceUrl: string; locator: string;
  bodyVerbatim: string | null; contentHash: string | null;
  review: "released" | "daee_evaluation_required" | "source_only";
};
export type RecommendationUsage = {
  modelCalls: number; modelSteps: number; searches: number; fetches: number;
  inputTokens: number; outputTokens: number; cacheReadTokens: number; cacheWriteTokens: number;
  uncachedInputTokens: number; costEstimateUsd: number | null; elapsedMs: number;
  pricingVerified: boolean; providerReportedSearches: number | null;
  voiceCostUsd: number; codexDevelopmentCostIncluded: false;
};
export type RecommendationResult = {
  requestId: string; contextVersion: string; status: RecommendationStatus;
  reason: string; materials: SourceRecommendation[];
  clarification: "specific_question" | "choose_aspect" | null;
  usage: RecommendationUsage;
  generatedReligiousAnswer: false;
};
export type RecommendationRequest = {
  conversationId: string; contextVersion: string; mode: RecommendationMode;
  locale: string; confirmedTranscript?: boolean;
};
export type ContextMessage = {id: string; body: string; sender_role: string; sender_id: string; created_at: string; received_at?: string | null};
export type AuthorizedRecommendationContext = {
  conversationId: string; contextVersion: string; orgId: string; actorId: string;
  audience: RecommendationAudience; locale: string; messages: ContextMessage[];
  aiEnabled: boolean; status: "waiting" | "active"; mode: RecommendationMode;
};
