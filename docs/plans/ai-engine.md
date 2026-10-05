# AI engine and the AI card

Goal: a working, tested AI card on the live link before the 21:00 mentor demo.

## Part 1: card model hardening (migration 0009)
- `cards_guard` trigger: source messages must belong to the card's conversation; a new version starts as a draft; an approved version is immutable (only expiry or soft delete); only the asker (or the service role) approves.
- `can_view_card` also checks `deleted_at`. Edits already create a new version, and viewers read the newest *approved* version.
- New columns: `cards.origin`, `cards.field_sources` (per-field source ids), `cards.ai_draft` (the generated text, for `edited_major`), `cards.deleted_at`, `ai_runs.actor_id` (rate limits).
- `.env.example`: DEMO_PASSWORD value removed.

## Part 2: the engine (`lib/ai/`)
- `tasks/<name>.ts`: `{ name, tier, schema, buildPrompt, postValidate, outputPolicy, ephemeralFields, rateLimit }`. `card.ts` is real; `classify.ts`, `assist.ts`, `intake.ts` are typed stubs.
- `runAI.ts` (server only), one pipeline for every task:
  1. `ai_enabled` off → fallback "disabled", no call.
  2. Rate limit per task and actor (from `ai_runs`).
  3. Model by tier from env; the first call per process verifies the id with a one-token request (logged, not awaited).
  4. System text from `lib/ai/prompts` only; user content in delimited blocks with `<` escaped, plus the data-not-instructions line.
  5. `streamText` + `Output.object` when the caller streams, else `generateText`; 12 s total; one retry on schema failure.
  6. `postValidate`; for model-authored tasks also `policy.ts` (ruling and citation markers) → fallback "policy".
  7. `ai_runs` row (task, model, input sha256, redacted output, latency, fallback, reason, actor) and an `ai_fallback` event on failure.
- Client: `useAITask` (idle / thinking / streaming / done / fallback, partial objects). UI: `ai-status`, `ai-badge`, `source-chips`.

## Part 3: the card task
- Each field is `{ text, source_ids }`, plus `undefined_fields`. Only the selected messages are fetched by id and sent, with their ids.
- `postValidate`: drop ids outside the selection; a filled field with no valid source becomes "غير محدد" and joins `undefined_fields`; cap each field's length.

## Part 4: the AI card UI
- After selecting messages: two equal choices, write it myself or AI draft.
- Consent line above the generation (what the guide reads and what it won't), selected messages highlighted.
- Streaming fields with source chips (hover or tap highlights the message), dashed "غير محدد" with a tooltip, inline edits marked "عدّلته أنت", and the persistent AI-draft label.
- Approval as in the manual flow; `edited_major` per docs/kpis.md; events with `origin: "ai"`.
- Fallback: the manual form with a calm note. Daee panel: the same chips and an origin line.

## Part 5: tests and evals
- `scripts/dev/ai-card.mjs`: three synthetic conversations (2 ar, 1 en). It asserts source ids stay in the selection, "غير محدد" for an unsupported field, the AI toggle forces the manual path, a forced timeout forces the manual path, and an injection attempt yields no religious content.
- `evals/` promptfoo cases + `npm run evals`.
- Push; check the Vercel env; verify one live generation.
