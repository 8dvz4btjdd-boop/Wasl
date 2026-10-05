// The Wasl card (manual path). AI cards will reuse these shapes with origin "ai".

export const CARD_FIELDS = ["follow_up", "covered", "remaining", "next_step"] as const;
export type CardField = (typeof CARD_FIELDS)[number];

/** Stored for any field the asker leaves empty (product limit 4: never guessed). */
export const UNDEFINED_FIELD = "غير محدد";

export const VISIBILITIES = ["this_daee", "team", "next_daee"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** "forever": until the asker deletes it (the default). Otherwise days. */
export const DURATIONS = ["forever", 7, 14, 30] as const;
export type Duration = (typeof DURATIONS)[number];

export const CARD_FIELD_MAX = 300;

export type Card = {
  id: string;
  conversation_id: string;
  version: number;
  status: "draft" | "daee_reviewed" | "approved" | "expired";
  follow_up: string | null;
  covered: string | null;
  remaining: string | null;
  next_step: string | null;
  preferred_daee: string | null;
  accept_substitute: boolean;
  visibility: Visibility;
  source_message_ids: string[];
  expires_at: string | null;
  approved_at: string | null;
  created_at: string;
};

export const CARD_COLUMNS =
  "id, conversation_id, version, status, follow_up, covered, remaining, next_step, preferred_daee, accept_substitute, visibility, source_message_ids, expires_at, approved_at, created_at";

export function isUndefinedField(value: string | null) {
  return !value || value === UNDEFINED_FIELD;
}
