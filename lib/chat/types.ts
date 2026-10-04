import type { Database } from "@/lib/db/types";

type Tables = Database["public"]["Tables"];

export type MessageRow = Pick<
  Tables["messages"]["Row"],
  "id" | "conversation_id" | "sender_id" | "sender_role" | "body" | "created_at"
>;

/** A message as the UI holds it: saved, or optimistic until the server confirms. */
export type ChatMessage = MessageRow & { state?: "pending" | "failed" };

export type ConversationStatus = Database["public"]["Enums"]["conv_status"];
export type Presence = Database["public"]["Enums"]["presence"];

export type LastMessage = Pick<MessageRow, "body" | "sender_role" | "created_at">;

export type ConversationSummary = {
  id: string;
  asker_id: string;
  status: ConversationStatus;
  topic: string | null;
  created_at: string;
  started_at: string | null;
  assigned_at: string | null;
  ended_at: string | null;
  previous_conversation_id: string | null;
  card_id: string | null;
  followup_mode: "none" | "manual" | "ai" | null;
  followup_sufficient: boolean | null;
  asker: { pseudonym: string; language: string; background: string | null } | null;
  /** Filled in by fetchInbox; null when the conversation has no messages yet. */
  last_message?: LastMessage | null;
};

export const TOPICS = ["quran", "prophet", "tawhid", "worship", "ethics", "doubts", "general"] as const;
export type Topic = (typeof TOPICS)[number];

export const QUESTION_MAX = 2000;
export const MESSAGE_MAX = 4000;

export const MESSAGE_COLUMNS = "id, conversation_id, sender_id, sender_role, body, created_at";
export const SUMMARY_COLUMNS =
  "id, asker_id, status, topic, created_at, started_at, assigned_at, ended_at, previous_conversation_id, card_id, followup_mode, followup_sufficient, asker:askers(pseudonym, language, background)";

/** The organization's day boundary for "ended today" (seeded hours are Riyadh time). */
export const ORG_TIME_ZONE = "Asia/Riyadh";
