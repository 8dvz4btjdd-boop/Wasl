import type { RecommendationMode, RecommendationRequest, RecommendationResult } from "./types";

export type RecommendationClientState = {
  phase: "idle" | "queued" | "loading" | "ready" | "error";
  result: RecommendationResult | null;
  error: "access" | "network" | "unavailable" | null;
};

type Context = { conversationId: string; contextVersion: string | null; locale: string; enabled: boolean };
type Options = {
  request: (request: RecommendationRequest, signal: AbortSignal) => Promise<RecommendationResult>;
  onChange: (state: RecommendationClientState) => void;
  now?: () => number;
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>;
  cancel?: (timer: ReturnType<typeof setTimeout>) => void;
  cooldownMs?: number;
  coalesceMs?: number;
};

export class RecommendationRequestError extends Error {
  constructor(
    public readonly category: "access" | "network" | "unavailable" | "retry_later",
    public readonly retryAfterMs = 20_000,
  ) {
    super(category);
  }
}

/** One request at a time; cooling down retains only the newest saved need.
 * Aborting a browser request does not undo work or charges already incurred by a provider.
 */
export class ContextualRecommendationController {
  private context: Context | null = null;
  private pending: RecommendationMode | null = null;
  private active: { controller: AbortController; generation: number } | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0;
  private startedAt = Number.NEGATIVE_INFINITY;
  private queuedAt = 0;
  private nextAllowedAt = 0;
  private automaticRetries = 0;
  private attempted = new Set<string>();
  private disposed = false;
  private state: RecommendationClientState = { phase: "idle", result: null, error: null };
  private readonly now: () => number;
  private readonly schedule: NonNullable<Options["schedule"]>;
  private readonly cancel: NonNullable<Options["cancel"]>;
  private readonly cooldown: number;
  private readonly coalesce: number;

  constructor(private readonly options: Options) {
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((callback, delay) => setTimeout(callback, delay));
    this.cancel = options.cancel ?? ((timer) => clearTimeout(timer));
    this.cooldown = options.cooldownMs ?? 20_000;
    this.coalesce = options.coalesceMs ?? 350;
  }

  update(context: Context) {
    if (this.disposed) return;
    const changedConversation = this.context?.conversationId !== context.conversationId;
    const changedVersion = this.context?.contextVersion !== context.contextVersion;
    const changedLocale = this.context?.locale !== context.locale;
    const wasEnabled = this.context?.enabled ?? false;
    this.context = context;
    if (changedConversation) {
      this.attempted.clear();
      this.startedAt = Number.NEGATIVE_INFINITY;
      this.nextAllowedAt = 0;
    }
    if (changedConversation || changedVersion || changedLocale || !context.enabled) {
      this.invalidate();
      this.automaticRetries = 0;
      this.publish({ phase: "idle", result: null, error: null });
    }
    if (!context.enabled || !context.contextVersion) return;
    if (changedConversation || changedVersion || changedLocale || !wasEnabled) {
      if (!this.attempted.has(`${context.locale}:${context.contextVersion}`)) {
        this.pending = "automatic";
        this.queuedAt = this.now();
        this.drain();
      }
    }
  }

  manual(mode: "refresh" | "expand") {
    if (this.disposed || !this.context?.enabled || !this.context.contextVersion) return;
    if (this.active?.generation === this.generation || this.pending) return;
    this.pending = mode;
    this.automaticRetries = 0;
    this.queuedAt = this.now();
    this.drain();
  }

  dispose() {
    this.disposed = true;
    this.invalidate();
  }

  private invalidate() {
    this.generation += 1;
    this.pending = null;
    if (this.timer) this.cancel(this.timer);
    this.timer = null;
    this.active?.controller.abort();
  }

  private publish(state: RecommendationClientState) {
    this.state = state;
    if (!this.disposed) this.options.onChange(state);
  }

  private drain() {
    if (this.disposed || !this.pending || !this.context?.enabled || !this.context.contextVersion) return;
    this.publish({ ...this.state, phase: "queued", error: null });
    if (this.active || this.timer) return;
    const remaining = Math.max(0, this.startedAt + this.cooldown - this.now(), this.queuedAt + this.coalesce - this.now(), this.nextAllowedAt - this.now());
    if (remaining > 0) {
      this.timer = this.schedule(() => {
        this.timer = null;
        this.drain();
      }, remaining);
      return;
    }
    const mode = this.pending;
    this.pending = null;
    const request: RecommendationRequest = {
      conversationId: this.context.conversationId,
      contextVersion: this.context.contextVersion,
      locale: this.context.locale,
      mode,
    };
    const controller = new AbortController();
    const generation = this.generation;
    const active = { controller, generation };
    this.active = active;
    this.startedAt = this.now();
    this.attempted.add(`${request.locale}:${request.contextVersion}`);
    if (this.attempted.size > 64) this.attempted.delete(this.attempted.values().next().value!);
    this.publish({ ...this.state, phase: "loading", error: null });
    // The server owns the thirty-second tool budget; this also bounds a disconnected client.
    const timeout = this.schedule(() => controller.abort(), 35_000);
    void this.options.request(request, controller.signal).then(
      (result) => {
        if (this.disposed || generation !== this.generation || result.contextVersion !== this.context?.contextVersion) return;
        if (result.status === "unchanged" && this.state.result) {
          this.publish({ ...this.state, phase: "ready", error: null });
        } else {
          this.publish({ phase: "ready", result, error: null });
        }
      },
      (error: unknown) => {
        if (this.disposed || generation !== this.generation) return;
        if (error instanceof RecommendationRequestError && error.category === "retry_later" && this.automaticRetries < 2) {
          this.automaticRetries += 1;
          // This is a server lease/cooldown response, not a new AI request. The server retains its budget.
          this.nextAllowedAt = this.now() + Math.min(60_000, Math.max(350, error.retryAfterMs));
          this.pending = mode;
          this.queuedAt = this.now();
          this.publish({ ...this.state, phase: "queued", error: null });
          return;
        }
        this.publish({
          ...this.state,
          phase: "error",
          error: error instanceof RecommendationRequestError && error.category !== "retry_later" ? error.category : "unavailable",
        });
      },
    ).finally(() => {
      this.cancel(timeout);
      if (this.active === active) this.active = null;
      this.drain();
    });
  }
}
