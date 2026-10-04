// lib/ai/schemas.ts
import { z } from "zod";

// Mirrors routing.locales (i18n/routing.ts).
export const Locale = z.enum(["ar", "en", "fr", "es", "ur", "id", "tl"]);

export const IntakeTurn = z.object({
  done: z.boolean(),
  nextQuestion: z.string().max(160).nullable(),
  refusedReligiousQuestion: z.boolean(),
  summary: z.object({
    question: z.string().max(400),
    topic: z.string(),
    language: Locale,
    depth: z.enum(["intro", "explain", "detailed"]),
  }).nullable(),
});

export const Classification = z.object({
  topic: z.enum(["quran", "prophet", "tawhid", "worship", "ethics", "doubts", "general"]),
  language: Locale,
  depth: z.enum(["intro", "explain", "detailed"]),
  needsDaee: z.literal(true),
});

export const CardDraft = z.object({
  follow_up: z.string().max(300),
  covered: z.string().max(300),
  remaining: z.string().max(300),
  next_step: z.string().max(200),
  grounded_in: z.array(z.string().uuid()),
  undefined_fields: z.array(z.enum(["follow_up", "covered", "remaining", "next_step"])),
});

export const LibraryRank = z.object({
  ids: z.array(z.string().uuid()).max(3),
});