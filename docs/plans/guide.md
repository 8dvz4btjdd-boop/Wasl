# The asker guide (text first, voice on top)

The waiting screen becomes the guide surface: while no daee has joined, the AI guide helps the asker state one clear question, which the asker confirms; that summary then drives routing, the daee's intake strip and the readings.

## 1. Task `intake` (fast tier, model_authored)
- **Input:** the first message, the guide conversation so far (asker and guide turns), and the locale.
- **Output:** `{ done, nextQuestion | null, refusedReligiousQuestion, summary: { question, topic, depth, level } | null }`.
- **Prompt:** INTAKE_SYSTEM rules, plus zero questions when the first message is already clear, plus the level scale (d = a personal ruling is requested).
- **`postValidate`:**
  - at most 3 questions in total, so done is forced after the third;
  - nextQuestion under 20 words;
  - no question about belief, background or conviction (marker check, which falls back);
  - a personal-ruling request forces level d;
  - done without a summary falls back.
- **Policy:** the check runs on nextQuestion. The summary restates the asker's own words (a question may contain حلال/حرام), so it's exempt.

## 2. Flow
- **Start:** the conversation is routed as today (chip or general). With AI on, the first message is no longer classified.
- **Guide:** runs only while no daee is assigned. One question at a time.
  - **Religious question from the asker:** the guide shows only "هذا سيجيب عنه الداعية", then continues.
  - **Skip:** "تخطَّ وانتظر الداعية" ends the guide, and the first message is classified as before.
  - **Daee joins:** the guide stops mid-step; an existing summary is applied, otherwise nothing changes.
- **Summary ready:**
  - classify runs on the summary's question;
  - the merged confirmation card shows the summary, topic and language, with correct / change, auto-confirming after 8 s;
  - on confirm, the conversation stores the summary, topic, depth and level, re-routes if still unassigned, and logs `classified`.
- **Level d:** the daee strip shows "يتطلب مختصًا" in amber, and no readings are suggested (asker or daee).
- **Events:** guide_started, guide_question, guide_refused, guide_done { questions, skipped }.

## 3. UI
- The queue circle becomes the orb (teal into violet): a slow pulse while listening, ripples while speaking, settled when done. Static with reduced motion.
- One question on screen in large type, the transcript beneath, and the guide's composer always visible.
- The "مرشد آلي" badge stays on screen.

## 4. Voice
- **Speech in:** Web Speech API with the locale's language code, and a mic button with a clear listening state. Hidden when unsupported (typing still works).
- **Speech out:** `/api/tts` proxies ElevenLabs when `ELEVENLABS_API_KEY` is set (the key never reaches the browser); otherwise the browser's speechSynthesis.
- **Controls:** a mute toggle. Nothing plays until the asker taps the mic or the speaker once.

## 5. Readings
- `<Readings />` sits under the orb once the summary is confirmed, built from the summary's question, topic and level.
- Passages are labeled "مقتطف" (the API caps them at 150 characters), with a visible "اقرأ المصدر كاملًا" link.
