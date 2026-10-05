# Approved-sources engine

Replaces the hand-built library as the primary path for readings. Readings are verbatim citations from five approved domains; nothing the model writes is ever shown.

## Verified constraints (Anthropic docs, checked before building)
- **Tool:** `web_search_20250305` (basic, direct caller, works on the fast model).
- **`allowed_domains`:** bare domains, no scheme; subdomains are included automatically. Paths are allowed but can't exclude a section, so the per-domain section rules run in `postValidate`.
- **Citations:** text blocks carry `citations` of type `web_search_result_location` with `url`, `title` and `cited_text`. The API caps `cited_text` at 150 characters, so readings are short verbatim passages; our 600-character cap never binds.
- **SDK gap:** the Vercel AI SDK doesn't expose `cited_text`, so `find_sources` calls the Messages API directly, inside runAI's enabled check, rate limit, logging, fallback and policy.
- **`pause_turn`:** handled by re-sending the paused turn, at most twice.

## 1. Fence (`lib/ai/sources/allowlist.ts`)
Five domains, nothing else:
- **dawa.center:** بينات (file 7937) first for doubts.
- **islamic-content.com:** allowed.
- **quranpedia.net:** the only place verse text may come from.
- **dorar.net:**
  - hadith only with a grading in the passage;
  - feqhia never reaches an asker;
  - aqeeda, tafseer and history allowed;
  - other sections dropped.
- **shamela.ws:** allowed.

`checkCitation(citation, audience)` applies the rules; anything off the list is dropped.

## 2. Task `find_sources` (fast tier, 30 s)
- **Input:** the confirmed question, topic, level (a–d), locale, audience.
- **Execution:** the task runs its own call (web search with `allowed_domains`) and returns only the citation blocks, with model prose discarded.
- **`postValidate`:** applies the fence, keeps at most 3 results with the passage untouched (≤ 600 characters), and dedupes by URL and text.
- **Policy:** model_authored, but citations are exempt; there is nothing else in the output.
- **Level rule:** level c or d for an asker returns empty, with no call.
- **Task type:** gains `timeoutMs`, a custom `execute`, and `policyExempt`.

## 3. Cache (migration 0013)
- **New table:** `source_pages` (url, title, domain, fetched_at).
- **`library_items` extended:**
  - `verified_by` human | auto;
  - `cited_text`;
  - `item_key`;
  - `asker_ok`;
  - levels a–d.
- **Retrieval order:** human items for topic and locale, then auto, then live search. Every verified live citation is stored as auto.
- **Admin Settings, "المصادر":** auto items with promote to human / remove (cut line: skipped first if time runs long).

## 4. The CSV
`scripts/seed-library.ts` validates each row: allowlisted URL, non-empty verbatim body, known topic, language and level. Valid rows are upserted by `item_key` with `verified_by = human`.

## 5. UI
`<Readings />`:
- a loading state while live search runs;
- each item shows the title, the verbatim passage, the URL and "منقول حرفيًا من المصدر";
- the AI badge sits on the header;
- empty state: "لا توجد قراءات معتمدة لهذا السؤال بعد".

It appears for the asker while waiting and for the daee in the context panel. `/api/ai/sources` has `maxDuration` 60.

## 6. Events
`sources_found { count, live }`. ai_runs as usual (input hash only).

## 7. Tests
`npm run evals` adds:
- three live questions (Kaaba, Quran authorship, Islam by the sword) whose citations come from approved domains only;
- level d → empty for askers;
- the fence rules: feqhia never reaches an asker, an ungraded hadith is dropped, any other domain is dropped.
