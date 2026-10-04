# Code review: server actions, logging, secrets

Reviewed during the design pass (Part 1), then re-checked after the admin workspace was added. Each finding is listed with what was changed.

## Leftover debug output
- `grep` for `[debug`, `TEMP` and `console.log` in `app/`, `components/` and `lib/` finds nothing; the temporary diagnostics from the Realtime investigation were removed.
- `console.log` remains only in CLI scripts (`scripts/seed.ts`, `scripts/demo-reset.ts`, `scripts/dev/*`), as progress output. None of it prints secrets.

## Server actions
Every action validates input with zod, checks the caller's role, and logs failures through `logServerError`; the user only ever sees a generic message.

| Action | zod | Role check | Errors logged | Change made |
|---|---|---|---|---|
| `signOut` (`lib/auth/actions.ts`) | locale | none needed (ends its own session) | yes | **Fixed:** invalid input used `.parse` and could throw an error page; now falls back to the default locale. |
| `signInStaff` | yes | profile must exist | yes | **Fixed:** removed the email from the unexpected-error log context (personal data not needed for debugging). |
| `createAsker` | yes | staff redirected away | yes | none |
| `returnAsker` | yes | public by design, rate-limited | yes | none |
| `startConversation` | yes | `requireAsker` | yes | none |
| `sendMessage` | yes | **added:** asker or daee only (admins never post); RLS and trigger still enforce participation and sender_role | yes | **Fixed:** explicit role check. |
| `setPresence` | yes | daee | yes | none |
| `endConversation` | uuid | **added:** daee (the SQL function also checks assignment) | yes | **Fixed:** explicit role check. |
| `markConversationRead` | uuid | **tightened:** daee only (was any staff) | yes | **Fixed:** role tightened; the count query's error is now logged. |
| `createDaee`, `updateDaee`, `setDaeeActive`, `updateSettings`, `setAiEnabled` (`lib/admin/actions.ts`) | yes | admin | yes | new in this pass |

## Secrets, return codes, personal data
- **Return codes** exist in plain form only in `createAsker`'s return value, which is shown once. They're stored as a salted SHA-256 and never logged. `returnAsker` logs user ids on failure, never the code.
- **Salt and hashes** aren't readable by client roles (column grants, `0002_identity.sql`).
- **Temporary staff passwords** (`createDaee`) are generated server-side, returned once to the admin's browser, and never stored in plain form or logged.
- **`DEMO_PASSWORD`** is read only inside scripts (seed, verify), never printed.
- **`logServerError` contexts** were checked with a grep for password, code, token, secret, salt and hash: none appear. Contexts carry ids, statuses and error codes only.
- **Admin and content:** admins read metrics through aggregate `security definer` functions (`0004_admin.sql`). `ai_runs.output`, which can contain generated card text, is no longer readable by client roles. Admins still can't read `messages` (verified: 0 rows).

## Other findings
- **Unused code:** `getUnreadCount` was removed; the inbox badge is now derived from the list.
- **Residual risk (documented, not fixed):** a deactivated daee (banned in Auth) keeps any access token they already hold until it expires (≤ 1 hour). In that window they can't set themselves available or receive new conversations (`is_active_staff` in routing and `set_presence`), but RLS still lets them read and reply in conversations already assigned to them. Closing that gap needs an `is_active_staff()` check in the message and conversation RLS policies; it's a small migration, not done here to keep the schema change minimal.
