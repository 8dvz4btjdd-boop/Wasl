# Wasl metric contract

Every number on the admin overview is defined here. The SQL functions in `supabase/migrations/0004_admin.sql` implement these definitions exactly, and the UI shows only what they return.

## Rules for all metrics
- **Aggregates only.** Admins read metrics through `security definer` functions that check `is_admin()` and return counts, rates and medians. No function returns message text, card text, intake text or AI output.
- **Minimum sample.** A rate is shown only when its denominator **n ≥ 5**. Below that the function returns `rate = null`, and the UI shows **"بيانات غير كافية"** / "Not enough data" with the current n. Counts and medians always show their n.
- **Time range.** `from`–`to` instants (UTC). Ranges: Today is from 00:00 in the organization's time zone (Asia/Riyadh) to now; 7 days is the last 7 × 24 h to now; Since launch is from the beginning of time to now. An event belongs to the range by its `events.created_at`.
- **Organization scope.** Everything is limited to the admin's organization (`profiles.org_id` of the caller).

## Live operations (`admin_ops_snapshot()`)
Current state, not range-bound.

| Metric | Formula | Source |
|---|---|---|
| Available daee | count of profiles with `role = 'daee'`, `status = 'available'`, not deactivated | `profiles`, `auth.users.banned_until` |
| Waiting askers | count of conversations with `status = 'waiting'` (no daee reply yet, assigned or not) | `conversations` |
| Longest current wait | `now() − min(created_at)` over those waiting conversations, in seconds; null when none | `conversations` |
| Active conversations | count of conversations with `status = 'active'` | `conversations` |

## Alerts (`admin_alerts(threshold_minutes)`)
Current state. `threshold_minutes` defaults to `organizations.wait_alert_minutes` (Settings).
- **Long wait:** a waiting conversation whose wait exceeds the threshold. It returns the language and the waiting-since time; no asker identity or content.
- **Uncovered language:** a language with at least one waiting, unassigned conversation and no available, active daee who lists it. It returns the language, the count and the oldest waiting-since time.

## KPI tiles (`admin_kpis(from, to)`)

### Correct first routing
- **Definition:** of the conversations routed in the range, the share that stayed with the first daee they were routed to.
- **Formula:** `n` = distinct `conversation_id` with a `routed` event in range. `correct` = those with no `transfer_completed` event (at any time). `rate = correct / n`.
- **Events:** `routed` (logged by `route_conversation` / `assign_waiting_for`), `transfer_completed` (tomorrow).
- **Note:** until transfers exist, nothing can be transferred, so every routed conversation counts as correct.

### Correct resumption
- **Definition:** of the follow-up sessions that started from a card (manual or AI), the share the daee rated as sufficient: they could continue without the asker repeating themselves.
- **Formula:** `n` = `followup_rated` events in range with `meta.mode ∈ {manual, ai}`. `correct` = those with `meta.sufficient = true`. `rate = correct / n`.
- **Events:** `followup_rated` (tomorrow).

### Card accuracy
- **Definition:** of the cards the asker approved, the share approved without a major edit.
- **Formula:** `n` = `card_approved` events in range. `correct` = those with `meta.edited_major = false`. `rate = correct / n`.
- **Major edit:** in any card field, the asker changed more than 30% of the characters (character-level edit distance ÷ the length of the generated text > 0.30), or replaced the content with "غير محدد".
- **Events:** `card_approved` (tomorrow).

## Comparison chart (`admin_comparison(from, to)`)
Follow-up sessions grouped by `mode`:

| Mode | Meaning |
|---|---|
| `none` | no card |
| `manual` | manual card |
| `ai` | AI card |

Two measures per mode, each with its own n under the bar:
- **Median time to first substantive reply:** for each `followup_started` event in range, the time until the first `first_substantive_reply` event in the same conversation at or after it. The median is taken over sessions that got such a reply. `n_reply` = those sessions.
- **Sufficiency rate:** `followup_rated` events in range for that mode. `rate = sufficient / n_rated`, shown only when `n_rated ≥ 5`.

Empty state: until follow-up sessions are logged, the chart explains that data appears after the first follow-up sessions.

## AI health (`admin_ai_health(from, to)`)

| Metric | Formula | Source |
|---|---|---|
| Runs | count of `ai_runs` in range | `ai_runs` |
| Fallback rate | `fallback = true` ÷ runs (shown when runs ≥ 5) | `ai_runs` |
| Median latency | median `latency_ms` over runs with a latency | `ai_runs` |

## Event names
Logged today:

| Event | When | Meta |
|---|---|---|
| `intake_created` | asker submits a question | `{ topic, language, generated_by }` |
| `routed` | a conversation is assigned to a daee | `{ daee_id, topic_match }` |
| `conversation_started` | the daee's first message | none |
| `first_substantive_reply` | the daee's first message over 40 characters | none |
| `ai_toggled` | an admin turns AI on or off in Settings | `{ enabled }` |
| `card_generated` | the asker saves the first version of a card | `{ origin: "manual" }` |
| `card_approved` | the asker approves a card | `{ origin: "manual", edited_major: false }` |
| `transfer_completed` | a daee hands a conversation to a colleague | `{ from_daee, to_daee }` |
| `followup_started` | a returning asker starts a follow-up | `{ mode: "none" \| "manual" }` |
| `followup_rated` | the daee answers "was the context enough?" | `{ mode, sufficient }` |

The manual path now logs all of the events below. The AI features **must** log the same names and meta shapes, with `origin: "ai"` / `mode: "ai"`; an AI card approved after a major edit logs `edited_major: true`:

| Event | When | Meta (required) |
|---|---|---|
| `transfer_completed` | a transfer to another daee is accepted | `{ from_daee, to_daee }` |
| `card_generated` | a card draft is created | `{ origin: "ai" \| "manual" }` |
| `card_approved` | the asker approves a card | `{ origin: "ai" \| "manual", edited_major: boolean }` |
| `followup_started` | a returning asker's follow-up session starts | `{ mode: "none" \| "manual" \| "ai" }` |
| `followup_rated` | the daee rates the follow-up | `{ mode: "none" \| "manual" \| "ai", sufficient: boolean }` |

`card_edited_major`, `resumed_from_card` and `card_generated` are also listed in CLAUDE.md as KPI events. The tiles above are defined on `card_approved.edited_major` and `followup_rated`, so those two must carry their meta even if the separate events are also logged.

`events.meta` never contains message text, card text or anything an asker typed.
