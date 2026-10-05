import "server-only";
import { MASTER_SYSTEM } from "@/lib/ai/prompts/master";
import type { AITask } from "@/lib/ai/task";
import { CARD_FIELDS, type CardField } from "@/lib/cards/types";
import { AICardSchema, keepSourcedFields, type AICard } from "./card";

export type MasterInput = {
  locale: string;
  /** Only the asker's approved session cards: their text and ids, oldest first. */
  cards: ({ id: string; approved_at: string } & Record<CardField, string | null>)[];
};

const LOCALE_NAMES: Record<string, string> = {
  ar: "Arabic", en: "English", fr: "French", es: "Spanish", ur: "Urdu", id: "Indonesian", tl: "Tagalog",
};

/** Merges approved session cards into the master card; source ids are session card ids. */
export const mergeMasterTask: AITask<MasterInput, AICard> = {
  name: "merge_master",
  tier: "card",
  schema: AICardSchema,
  outputPolicy: "asker_sourced",
  ephemeralFields: CARD_FIELDS.map((f) => `${f}.text`),
  rateLimit: { max: 5, windowMinutes: 60 },
  buildPrompt(input) {
    return {
      system: MASTER_SYSTEM.replace("{locale}", LOCALE_NAMES[input.locale] ?? "the asker's language"),
      blocks: [
        {
          tag: "session_cards",
          content: input.cards
            .map((c) => [`[${c.id}] ${c.approved_at.slice(0, 10)}`, ...CARD_FIELDS.map((f) => `${f}: ${(c[f] ?? "").replace(/\s+/g, " ").trim()}`)].join("\n"))
            .join("\n\n"),
        },
      ],
      instruction: "Merge the session cards into the master card.",
    };
  },
  postValidate(output, input) {
    return { ok: true, output: keepSourcedFields(output, input.cards.map((c) => c.id)) };
  },
};
