# Master card and fixes

## 1. Fixes
- Rating question 2: "هل لخّصت البطاقة الحوار السابق بشكل دقيق دون الحاجة إلى تعديل؟" (all locales). A journey check confirms the rating panel appears only after the daee clicks End, never on open.
- Routing: topic "general" is a full match for any daee who speaks the language and is available. "general" is no longer a selectable specialty in admin Team.
- An explicit chip wins over the AI classification. The AI classification is still run and logged next to it: `classified { topic, source: "chip", ai_topic, confidence }`.

## 2. Master card
- **Data (migration 0011):**
  - `cards.scope` is `session` | `master`. `cards.source_card_ids` holds a master card's sources (approved session card ids).
  - A master card has no conversation (`conversation_id` null) and versions per asker. The guard checks its sources are the asker's approved session cards.
  - Immutability, expiry, deletion and asker-only approval are unchanged. `delete_master_card()` deletes it.
- **Flow:**
  - After a session card is approved, if the asker has at least two approved session cards, the card page offers "تحديث بطاقتك الرئيسية", which opens `/card/master`.
  - With AI on, the `merge_master` task streams the merge (input: only the approved session cards' text and ids; source ids are session card ids; asker_sourced).
  - The UI is the same as for the session card, with chips linking to the session cards. The asker edits, sets visibility and duration, and approves.
  - With AI off, the page prefills the previous master for editing.
- **Daee panel:**
  - The master card comes first, labeled "بطاقة وصل · محدّثة بعد N جلسات", with AI styling if AI-drafted.
  - Below it, "الجلسات السابقة" is a foldable list of the session cards with dates, each expandable.
  - RLS decides what's visible.
- **Return and resume:**
  - A follow-up links the master card when it exists (`next_daee` access is granted on assignment as before).
  - The daee header shows "من حيث توقف" from it.
- **Events and KPIs:** `master_card_generated` and `master_card_approved { origin, edited_major }`. Card accuracy counts session cards only; master card accuracy is a separate line.

## 3. Tests
`scripts/dev/master.mjs` drives one asker through three sessions with خالد and checks:
- the session cards, and the master updated twice;
- the daee sees the master plus two folded sessions;
- return uses the master;
- the AI-off prefill.

Then the existing suites, push, and a live check.
