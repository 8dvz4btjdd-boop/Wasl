import "server-only";
import { z } from "zod";
import { SOURCES_SYSTEM } from "@/lib/ai/prompts/sources";
import { ALLOWED_DOMAINS, preferFirst, rejectReason, type Audience, type Citation } from "@/lib/ai/sources/allowlist";
import type { AITask } from "@/lib/ai/task";

const MAX_RESULTS = 3;
const MAX_CITED = 600;
const MAX_CONTINUATIONS = 2;

export const SourcesSchema = z.object({
  items: z.array(z.object({ url: z.string(), title: z.string(), cited_text: z.string() })),
});
export type SourcesOutput = z.infer<typeof SourcesSchema>;

export type SourcesInput = {
  question: string;
  topic: string;
  /** a: first steps … d: specialist. Askers get nothing at c or d. */
  level: "a" | "b" | "c" | "d";
  locale: string;
  audience: Audience;
};

type ContentBlock = { type: string; text?: string; citations?: { type: string; url: string; title: string; cited_text: string }[] };

/**
 * Searches the approved sites with Anthropic's web search tool and keeps only its citation
 * blocks (url, title, cited_text): the model's prose is discarded. The Vercel AI SDK doesn't
 * expose cited_text, so this calls the Messages API directly; runAI still wraps it.
 */
async function searchApproved({ model, system, userText, signal }: { model: string; system: string; userText: string; signal: AbortSignal }) {
  const messages: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: userText }];
  const citations: Citation[] = [];
  for (let turn = 0; turn <= MAX_CONTINUATIONS; turn++) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 1024,
        system,
        messages,
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 3, allowed_domains: [...ALLOWED_DOMAINS] }],
      }),
    });
    if (!res.ok) throw new Error(`messages api ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { content: ContentBlock[]; stop_reason: string };
    for (const block of body.content) {
      for (const c of block.citations ?? []) {
        if (c.type === "web_search_result_location") citations.push({ url: c.url, title: c.title ?? "", cited_text: c.cited_text ?? "" });
      }
    }
    if (body.stop_reason !== "pause_turn") break;
    messages.push({ role: "assistant", content: body.content });
  }
  return { items: citations };
}

export const findSourcesTask: AITask<SourcesInput, SourcesOutput> = {
  name: "find_sources",
  tier: "fast",
  schema: SourcesSchema,
  outputPolicy: "model_authored",
  // The items are the sources' own words, verbatim; the policy applies to anything else.
  policyExempt: ["items"],
  ephemeralFields: [],
  rateLimit: { max: 20, windowMinutes: 60 },
  timeoutMs: 30_000,
  buildPrompt(input) {
    return {
      system: SOURCES_SYSTEM.replace("{locale}", input.locale),
      blocks: [{ tag: "question", content: input.question }],
      instruction: `Find approved passages for this question. Topic: ${input.topic}. Level: ${input.level}.`,
    };
  },
  execute: ({ model, system, userText, signal }) => searchApproved({ model, system, userText, signal }),
  postValidate(output, input) {
    return { ok: true, output: { items: keepApproved(output.items, input) } };
  },
};

/** The fence, the per-domain rules, dedupe, the preferred source first, at most 3, verbatim. */
export function keepApproved(items: Citation[], input: Pick<SourcesInput, "audience" | "topic" | "level">): Citation[] {
  if (input.audience === "asker" && (input.level === "c" || input.level === "d")) return [];
  const seen = new Set<string>();
  const kept: Citation[] = [];
  for (const c of items) {
    if (rejectReason(c, input.audience)) continue;
    const key = `${c.url}\n${c.cited_text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    // Verbatim: never edited, only bounded.
    if (c.cited_text.length > MAX_CITED) continue;
    kept.push({ url: c.url, title: c.title, cited_text: c.cited_text });
  }
  kept.sort((a, b) => Number(preferFirst(b, input.topic)) - Number(preferFirst(a, input.topic)));
  return kept.slice(0, MAX_RESULTS);
}
