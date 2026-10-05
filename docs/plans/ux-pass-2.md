# UX pass 2

Executed without waiting for approval (as asked). Decisions taken along the way are listed at the end.

## 1. Footer and privacy page
- `SiteFooter` becomes one row: organization name, "مدعوم من وصل" with the mark, links to Privacy (`/privacy`), How we use AI (`/#ai`) and Staff sign in (`/login`), and the year. No language menu (the header has it).
- New `/[locale]/privacy` page: the full statement (what we ask for, the return code, cards: who sees them, how long, deleting, 12-month inactivity removal, admins never read conversations, AI).
- Footer on landing, privacy and login only. Enter and return lose theirs; wait, chat and card never had one.

## 2. Back control
- The compact header takes a back control at the start (enter, return, login), to the landing page.
- On enter, the control steps back through the questions first (background → pseudonym → landing). A small client registry lets the page register a back handler; without one the control is a plain link to `/`.
- The return-code screen is not a step: once a code is shown, back leaves (the asker exists).

## 3. Daee account menu and profile sheet
- The rail avatar is a button with hover and focus states and a menu: Profile, Presence (available / busy / offline, the same radio group as the 1/2/3 shortcuts), Sign out.
- Profile opens a side sheet (end side): name, email, languages, topics, capacity (read-only, edited by the admin), current status, and today's numbers: conversations handled (conversations where they sent a message today) and median first reply (assigned today → their first message).

## 4. Presence truth (migration 0008)
- `profiles.last_seen`. The workspace calls `presence_heartbeat()` every 30 s (and on focus). It refreshes `last_seen`; if the previous beat is older than 90 s, the daee was gone, so status resets to offline first.
- `presence_fresh(ts)` (90 s) is the one threshold. Every availability check (routing, assign on becoming available, transfer candidates and targets, requeue, the landing count, admin live ops and alerts) requires `status = 'available' and presence_fresh(last_seen)`.
- pg_cron every 30 s marks stale daee offline, so the stored status is true for every reader (admin team table, resume panel). Closing the tab therefore leaves nobody available for more than ~2 minutes, and nobody is *routed to* after 90 s.
- Signing out sets the daee offline first.

## 5. Card retention and deletion
- Default duration: "حتى أحذفها" (no expiry, `expires_at = null`); 7, 14, 30 days remain. Access rows for unlimited cards use `until = 'infinity'`.
- The asker deletes a card (all versions of it) from the card page; `card_access` cascades, follow-up links are set null, daee access ends immediately (RLS reads the rows).
- pg_cron daily: approved cards with no activity for 12 months are removed. Activity = approval, a new version, or a follow-up that started from the card.
- `docs/kpis.md`: card accuracy uses `card_approved` events, which are not removed, so no metric depends on card retention; recorded there.

## 6. Resumption rating at the end
- The panel no longer asks after the first substantive reply. Ending a follow-up (any mode) opens two one-tap questions before closing: "هل ساعدك السياق على المتابعة دون البدء من الصفر؟" and, only when the follow-up had a card, "هل كانت البطاقة دقيقة؟". Skip ends without rating; shown every time.
- `rate_followup(conv, sufficient, card_accurate)` logs `followup_rated { mode, sufficient, card_accurate }` (null for an unanswered question; nothing logged when both are skipped).
- KPI: correct resumption counts rated sessions where `sufficient` was answered; comparison already uses none / manual / ai.

## 7. Bidi
- `isolate()` wraps user-controlled values (pseudonyms, daee names, search queries, card text) in FSI…PDI wherever they sit inside a translated sentence. Audit every message with `{pseudonym}`, `{name}`, `{to}`, `{from}`, `{query}`.

## 8. New return code
- The ended panel gets "أظهر رمز عودة جديد": a server action generates a code, replaces the stored hash (same salt and SHA-256), and returns the code once; the old code stops working. The reveal reuses the enter flow's code component with copy. Nothing logs the code.

## 9. Verify
- Build, lint, typecheck; journey (card default, delete, end-of-follow-up rating, new code, presence heartbeat and sign-out) and regression scripts; screenshots ar and en at 1440 and 390; commit, push, live smoke check.
