# Guide rework and the two assistants

Stop at 14:00 regardless and report.

## Part 0: guide on entry, and the stall
- **Diagnosis:**
  - intake `ai_runs` show no fallbacks at all (3 successes);
  - the live trail: question 1 logged, the asker answered, no second intake run, skip 30–60 s later;
  - so the answer's server action never reached runAI;
  - the client had no error handling around it, so any rejected request left the UI on "لحظة…" forever;
  - the policy check is not involved, so nothing is added to policyExempt.
- **Fix:** guide steps are wrapped server-side (any exception → fallback + `guide_error { reason }` + server log). Client-side there's a 30 s limit, one retry, then a calm fallback to the plain question box with what the asker typed.
- **New flow:** pseudonym → background → (code) → `/wait`:
  1. the resume choice for returning askers, then the guide, which opens with "ما سؤالك؟";
  2. up to 3 questions, voice or text, skip any time;
  3. the asker confirms the summary;
  4. the conversation is created with the summary as its first message;
  5. classification and routing run on the summary;
  6. the waiting screen shows readings.
- **AI off:** the plain question box, as before. The waiting screen no longer runs the guide.
- **Voice:**
  - speech in uses Web Speech with the locale's code;
  - speech out goes ElevenLabs via `/api/tts`, which returns `X-TTS-Path` (elevenlabs | fallback) and logs it, with the browser voice as fallback;
  - a mute toggle, and nothing plays before a tap.

## Part 1: question-tailored retrieval
- `lib/ai/sources/needs.ts`: `normalizeNeed`, `isSubstantiveNeed`, `chooseNeed`, from Ahmed's triggers. Greetings, thanks and repeats never search; a correction is a new need.
- **`plan_queries` task:** fast tier, model_authored. The question plus up to 6 recent messages become 2–3 short concept queries in the source language, never an answer. `find_sources` searches with them; the topic is a prior.
- **Cache key:** the normalized need's sha256 (`library_items.need_hash`). Tiers:
  1. the auto cache for that exact need;
  2. a live search;
  3. human items by topic and locale as the fallback (also the AI-off path).
- **`lib/ai/sources/fetch.ts`, ported from Ahmed's fetch-source:**
  - public-address guard, redirect checks, `extractOriginalArticle`, and the islamic-content.com dictionary adapter;
  - after the fence, the 150-character snippet is extended to the verbatim passage in the page that contains it (≤ 1,500 characters, sha256);
  - when the fetch fails or the snippet isn't found, the snippet stays as it is.

## Part 2: the asker assistant
- The waiting screen shows readings for the confirmed summary only, up to 3, labeled "اقتُرحت لك", and none for level c or d.
- What the asker was shown is recorded per conversation (`conversation_readings`) for the daee.

## Part 3: the daee assistant (tab "المساعد" in the context panel)
- **ما رآه السائل:** what the asker was shown, collapsed.
- **Per-message search:** a sparkle on each asker message, using the last 6 messages as context, audience daee.
  - Feqhia is allowed, labeled "فقه، لا يُحوَّل إلى فتوى"; hadith only with a grading.
  - Shift-click or a checkbox selects several, then "ابحث عن المحدد".
  - Results are verbatim with the link and "أدرج كاقتباس", which goes into the composer and is never sent.
- **Free search:** "ابحث في المصادر المعتمدة", the same engine and the same fence.
- **Tone (`assist_tone`):**
  - fast tier; labels hurried, confused, frustrated, neutral, or "غير محدد"; it describes the messages, not the person;
  - all output is ephemeral: `ai_runs` stores no output;
  - never shown to the admin, hidden with AI off;
  - shown as one quiet line.
- **Access:** the assigned daee only; after a transfer, context starts at the transfer time.

## Part 4: tests
- **Guide:** the entry paths with 0, 1 and 3 questions, skip, and AI off.
- **Voice:** the route tested live.
- **Needs filter:** greeting, thanks, repeat, correction.
- **Query planning:** no religious content.
- **Extension:** the snippet stays inside the extended passage.
- **Daee search:** per-message and multi-select; insert-as-quote never sends.
- **Tone:** never persisted, and the admin never sees it.
- Then push and live checks.

## Cut lines
In order: page-fetch extension, multi-select, free search. Never cut Part 0, Part 1 steps 1–2, or the tone guardrails.
