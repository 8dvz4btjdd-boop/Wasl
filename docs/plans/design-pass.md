# Design pass: reliability, workspace, login, landing

Executed in order without waiting for approval (as requested). No database schema changes. UI work follows the frontend-design guidance inside the fixed brand (`docs/design.md`) and CLAUDE.md rules.

## Part 1: Reliability

**Realtime resilience**: one hook, `useResilientChannel`, used by every subscription (asker messages, asker conversation row, daee inbox, daee messages).
- Subscribes only after the session token is on the socket (keeps the existing fix).
- On `CLOSED`, `CHANNEL_ERROR` or `TIMED_OUT` (not caused by our own cleanup), it removes the channel and resubscribes with backoff: 1s, 2s, 4s… capped at 30s.
- Every `SUBSCRIBED` triggers a resync (re-fetch of the rows the channel feeds), so nothing missed while disconnected is lost.
- While not `SUBSCRIBED`, the same resync runs every 10s as a polling fallback.
- It also resyncs when the tab becomes visible.

**Token refresh**: the browser client listens for `TOKEN_REFRESHED` and calls `realtime.setAuth(newToken)`.

**Code review**: findings go in `docs/plans/review.md`, and fixes are made in the same pass. Checks:
- leftover debug logs;
- every server action: zod input, role check, `logServerError` on failure;
- no secrets, passwords or return codes in any log.

**`npm run demo:reset`**: `scripts/demo-reset.ts` (service client).
- Deletes all asker data: anonymous auth users (cascades askers, intakes, conversations, messages), then any leftovers, plus all notifications, events and return_attempts.
- Resets presence to the seed values.
- Keeps the org and staff.
- Refuses to run without `--yes`, since it is destructive. I won't run it.

## Part 2: Daee workspace (Intercom Inbox, Genesys agent desktop, Linear)
```
┌──┬──────────────────────┬──────────────────────────────┬─────────────────┐
│◉ │ Inbox     ● Available▾│ Salem · AR · Tawhid  [تنتظر 03:12] [End] [⊟] │
│✉3│ [ Search…          ] │ "Background line"            │ Asker           │
│  │ Waiting 2 Active 1 E 4│──────────── Today ─────────── │  pseudonym…     │
│  │ (S) Salem AR Tawhid ●│  bubbles…                     │ بطاقة وصل       │
│  │     preview…   03:12 │  ── خالد joined ──            │  لا توجد بطاقة   │
│  │ (N) Noor  …          │                               │                 │
│(K)│                     │ [ reply…                 ] ↑  │                 │
└──┴──────────────────────┴──────────────────────────────┴─────────────────┘
```
- **Layout:** full viewport (`h-dvh`, page never scrolls). List, messages and context panel each scroll on their own.
- **Rail:**
  - logo and Inbox with its badge;
  - at the bottom, an avatar (initial in a circle with a presence-coloured ring) that opens a small menu: name, presence, sign out.
- **List header:** title plus a compact presence chip (dot, label, chevron) with a dropdown. Then a search field (pseudonym or last message) and segments with counts: Waiting / Active / Ended today.
- **Rows:**
  - avatar initial (tint derived from the pseudonym), pseudonym, language badge, topic chip;
  - a one-line preview of the last message, a labelled relative time ("3 د" / "3m"), and an unread dot;
  - waiting rows show the live wait timer in amber (new AA-checked `--warning-fg` token).
- **Unread rule (decision):** a conversation is unread when its last message is from the asker (it's waiting for a reply). The rail badge counts exactly those rows, so the badge always matches the list. It's derived from data, so it survives reloads. Routing notifications still drive the toast.
- **Empty states** per segment, worded for each case; the Waiting state adds a hint when you're not Available.
- **Conversation header:**
  - pseudonym, language, topic, and a status pill with a labelled timer ("تنتظر 03:12" amber, "نشطة منذ 6 د" teal);
  - the shared background as a quiet line under the name;
  - End conversation (inline confirm kept) and the context panel toggle.
- **Context panel** (end side, 320px, collapsible, remembered per browser):
  - asker details: pseudonym, language, topic, background, started at, and the number of past conversations (counted server-side with the service client; no content is read);
  - a "بطاقة وصل" section with the empty state "لا توجد بطاقة بعد", as a shell for tomorrow's card.
- **Messages:**
  - day separators;
  - system lines for joined (`assigned_at`) and ended (`ended_at`).
- **Ended footer** replaces the composer: "انتهت 10:08 · 6 دقائق". The header shows no status pill once ended, so the status is never shown twice.

## Part 3: Staff login (split layout)
- **Form side:**
  - logo, title, email;
  - password with a show/hide toggle and a caps-lock hint;
  - submit with a loading state, inline errors;
  - locale switcher at the top end.
- **Brand side:**
  - navy;
  - the logo's two bubbles drift together once on load (<300ms, ease-out, static under reduced motion);
  - one line of value proposition.
- **Mobile:** a single column; the brand side collapses away.

## Part 4: Landing `/[locale]`
- **Asker surface (dark):**
  - the organization name from `organizations` at the top (server-side read);
  - hero: logo, the line "تحدث مع إنسان عن الإسلام، وأكمل من حيث توقفت", primary Start and secondary Return with a code;
  - a prominent language switcher;
  - three trust points with icons: a real person, not a bot; anonymous by default; you control what's shared.
- **Footer:** staff sign-in as a small link.
- The token preview moves to `/[locale]/dev/design` (noindex).

## Part 5: Verify
- Build, typecheck and lint.
- **Screenshots:** a Playwright script captures every changed screen in ar and en at 1440 and 390px into `docs/screenshots/`. The daee screens use a login performed inside the script from `DEMO_PASSWORD`, which is never printed.
- **Chat test:** the two-session test runs again with two isolated Playwright browser contexts (daee1 and an asker).
- Logical commits, push, and a summary with what couldn't be verified and the decisions for you.
