import "server-only";
import { z } from "zod";
import { CARD_SYSTEM } from "@/lib/ai/prompts/card";
import type { AITask } from "@/lib/ai/task";
import { CARD_FIELD_MAX, CARD_FIELDS, UNDEFINED_FIELD, type CardField } from "@/lib/cards/types";

const Field = z.object({ text: z.string(), source_ids: z.array(z.string()) });

export const AICardSchema = z.object({
  follow_up: Field,
  covered: Field,
  remaining: Field,
  next_step: Field,
  undefined_fields: z.array(z.enum(CARD_FIELDS)),
});
export type AICard = z.infer<typeof AICardSchema>;

export type CardInput = {
  locale: string;
  /** Only the messages the asker selected, fetched by id from their conversation. */
  messages: { id: string; role: "asker" | "daee"; body: string }[];
};

const LOCALE_NAMES: Record<string, string> = {
  ar: "Arabic", en: "English", fr: "French", es: "Spanish", ur: "Urdu", id: "Indonesian", tl: "Tagalog",
};

export const cardTask: AITask<CardInput, AICard> = {
  name: "card",
  tier: "card",
  schema: AICardSchema,
  outputPolicy: "asker_sourced",
  // The card restates the asker's words: ai_runs keeps sources and lengths, not text.
  ephemeralFields: CARD_FIELDS.map((f) => `${f}.text`),
  rateLimit: { max: 5, windowMinutes: 60 },

  buildPrompt(input) {
    return {
      system: CARD_SYSTEM.replace("{locale}", LOCALE_NAMES[input.locale] ?? "the asker's language"),
      blocks: [
        {
          tag: "selected_messages",
          content: input.messages.map((m) => `[${m.id}] (${m.role}): ${m.body.replace(/\s+/g, " ").trim()}`).join("\n"),
        },
      ],
      instruction: "Draft the card from the selected messages.",
    };
  },

  postValidate(output, input) {
    const selected = new Set(input.messages.map((m) => m.id));
    const undefinedFields = new Set<CardField>();
    const result = { ...output } as AICard;
    for (const field of CARD_FIELDS) {
      const sources = [...new Set(output[field].source_ids.filter((id) => selected.has(id)))];
      let text = output[field].text.trim();
      if (!text || text === UNDEFINED_FIELD || sources.length === 0) {
        text = UNDEFINED_FIELD;
        undefinedFields.add(field);
        result[field] = { text, source_ids: [] };
        continue;
      }
      if (text.length > CARD_FIELD_MAX) text = `${text.slice(0, CARD_FIELD_MAX - 1).trimEnd()}…`;
      result[field] = { text, source_ids: sources };
    }
    result.undefined_fields = CARD_FIELDS.filter((f) => undefinedFields.has(f));
    return { ok: true, output: result };
  },
};
