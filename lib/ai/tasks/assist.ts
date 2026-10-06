import "server-only";
import { z } from "zod";
import { TONE_SYSTEM } from "@/lib/ai/prompts/assist";
import type { AITask } from "@/lib/ai/task";

export const TONES = ["hurried", "confused", "frustrated", "neutral", "undefined"] as const;
export const ToneSchema = z.object({ tone: z.enum(TONES) });
export type ToneOutput = z.infer<typeof ToneSchema>;
export type ToneInput = { messages: string[] };

/**
 * How the asker's last messages read (for the daee's pacing). Describes the messages, not the
 * person; a closed set of labels. Ephemeral: the output is never stored anywhere, not even in
 * ai_runs, and never reaches the admin.
 */
export const assistToneTask: AITask<ToneInput, ToneOutput> = {
  name: "assist_tone",
  tier: "fast",
  schema: ToneSchema,
  outputPolicy: "model_authored",
  ephemeralFields: ["tone"],
  persistOutput: false,
  rateLimit: { max: 60, windowMinutes: 60 },
  buildPrompt(input) {
    return {
      system: TONE_SYSTEM,
      blocks: [{ tag: "recent_messages", content: input.messages.slice(-6).map((m, i) => `${i + 1}. ${m}`).join("\n") }],
      instruction: "Label how these messages read.",
    };
  },
  postValidate(output, input) {
    // Too little text to tell: always undefined.
    const words = input.messages.join(" ").trim().split(/\s+/).filter(Boolean).length;
    return { ok: true, output: words < 3 ? { tone: "undefined" } : output };
  },
};
