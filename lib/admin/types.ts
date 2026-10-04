// Shapes returned by the admin_* SQL functions (supabase/migrations/0004_admin.sql).

export type OpsSnapshot = {
  available_daee: number;
  waiting: number;
  longest_wait_seconds: number | null;
  active: number;
  as_of: string;
};

export type Alerts = {
  threshold_minutes: number;
  long_waits: { language: string; since: string }[];
  uncovered_languages: { language: string; count: number; since: string }[];
};

export type Rate = { n: number; correct: number; rate: number | null };

export type Kpis = {
  correct_first_routing: Rate;
  correct_resumption: Rate;
  card_accuracy: Rate;
};

export type ComparisonRow = {
  mode: "none" | "manual" | "ai";
  sessions: number;
  n_reply: number;
  median_first_reply_seconds: number | null;
  n_rated: number;
  sufficient: number;
  sufficiency_rate: number | null;
};

export type AiHealth = {
  runs: number;
  fallbacks: number;
  fallback_rate: number | null;
  median_latency_ms: number | null;
  n_latency: number;
};

export type TeamMember = {
  user_id: string;
  display_name: string;
  email: string | null;
  languages: string[];
  topics: string[];
  capacity: number;
  status: "available" | "busy" | "offline";
  open: number;
  active: boolean;
};

export type EventRow = { id: number; type: string; created_at: string; conversation_id: string | null; actor_role: string | null };
export type AiRunRow = {
  id: number;
  task: string;
  model: string | null;
  latency_ms: number | null;
  fallback: boolean;
  reason: string | null;
  created_at: string;
};

export type OrgSettings = { id: string; name: string; languages: string[]; ai_enabled: boolean; wait_alert_minutes: number };
