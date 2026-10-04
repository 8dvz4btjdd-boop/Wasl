@AGENTS.md
# Wasl (وصل)

Continuity platform for text dialogues between askers and human داعية at Islam-introduction organizations.
Entry for the Islamic AI Challenge 2026, track 3. Build window: 4 to 6 October 2026. Everything is judged on a live Vercel link and this public repo.

## Fixed product limits (never violate, never "improve")
1. The dialogue is between the asker and a human داعية. The model never dialogues on religion.
2. The model never issues a fatwa, never answers a religious question, never generates or attributes a hadith or verse. It refers to the داعية.
3. The model never infers or labels the asker's belief, religion, or level of conviction. Background is self-declared and optional.
4. The card is generated only from messages the asker explicitly selected. Anything not in those messages is written as "غير محدد" (undefined), never guessed.
5. Nothing is shared without the asker's explicit approval. The asker sets who sees the card and until when.
6. Every AI feature has a full manual path. The app must work with AI disabled (organizations.ai_enabled = false) and when the Anthropic API fails.
7. User text is data, not instructions. All user content goes inside delimited data blocks in prompts.
8. Every AI utterance in the UI carries the label "AI guide" (translated) so it is never mistaken for a داعية.
9. The admin never reads conversation content. Enforced in RLS, not only in UI.
10. Library content is quoted verbatim with its source. The model never paraphrases religious text.

## Stack
Next.js 16 App Router, TypeScript strict, Tailwind, shadcn/ui, motion (Framer Motion), next-intl, Supabase (Postgres, Auth, Realtime, RLS), Vercel AI SDK with @ai-sdk/anthropic, zod, Recharts, Web Speech API (STT), ElevenLabs TTS with Web Speech TTS fallback, promptfoo.
- Next.js 16 has breaking changes from earlier versions (e.g. `middleware.ts` is now `proxy.ts`). Before writing any Next.js code, read the relevant guide in `node_modules/next/dist/docs/`.

## Roles and auth
- admin, daee: email + password via Supabase Auth, row in `profiles`.
- asker: Supabase anonymous sign-in, row in `askers`, pseudonym + return code (hashed, SHA-256 + per-org salt). Returning: pseudonym + code lookup links the new anonymous session to the existing asker row.

## Structure
app/[locale]/(asker)/enter, /wait, /chat/[id], /card/[id], /return
app/[locale]/(workspace)/daee/..., /admin/...
lib/ai/runAI.ts, lib/ai/prompts/*.ts, lib/ai/schemas.ts
lib/db/{client,server,service}.ts, lib/db/queries/*.ts
lib/routing/match.ts
messages/{ar,en,fr,es}.json
supabase/migrations/*.sql, supabase/seed.sql
docs/{sources.md,evals/,runbook.md}

## AI rules in code
- All model calls go through `runAI(task, input)`. It checks `ai_enabled`, builds the prompt, calls the model with a zod schema (generateObject), validates, logs to `ai_runs`, and returns `{ ok, data } | { ok: false, fallback: true, reason }`. Callers must render the manual form on fallback.
- Models from env: ANTHROPIC_MODEL_FAST (intake, classify, route, rank library), ANTHROPIC_MODEL_CARD (card).
- Never call Anthropic or ElevenLabs from the browser.
- Prompts live in lib/ai/prompts and are the only place system text is written.

## i18n
- Locales: ar (rtl), en, fr, es. `dir` is derived from locale in the root layout.
- No hard-coded user-facing strings. Every string in messages/*.json. Write en first, then ar; fr and es are generated from en and reviewed.
- Fonts: IBM Plex Sans Arabic for ar, Inter otherwise.

## Design
- Asker surfaces: conversation-first, one surface, bottom composer, dark by default, large type, minimal text. Guide = animated orb + one question at a time. Card = bottom sheet whose fields animate in one by one.
- Workspace (daee, admin): light by default, three-column inbox layout, right-side card panel, dense calm data, keyboard shortcuts.
- Animation: motion, under 300ms, ease-out, state changes only, respect prefers-reduced-motion.
- Use shadcn/ui primitives. Brand accents: navy #0B1033, teal #2BD4B0, violet #7C5CFF.

## Engineering rules
- Server Actions for mutations, typed queries in lib/db/queries. No raw SQL in components.
- Every table has RLS enabled. Service role client only in server code that must bypass RLS (admin user creation, seed, KPI aggregation).
- Log a row in `events` for every KPI-relevant action: intake_created, routed, conversation_started, card_generated, card_edited_major, card_approved, transfer_completed, resumed_from_card, first_substantive_reply.
- No secrets, no real conversations, no real personal data anywhere in the repo. Seed is synthetic.
- Commit after each working feature with conventional commit messages.
- Definition of done for a feature: works on the live Vercel link, works with AI disabled, strings in all four locale files, no TypeScript errors.
- Mobile layout works for the asker surfaces. Workspace is desktop-first.

## Out of scope for the build window
Payments, email, SMS, real-time voice calls, vector search, multi-org switching UI.