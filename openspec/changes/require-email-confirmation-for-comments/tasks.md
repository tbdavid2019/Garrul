# Tasks

## 1. Configuration and pending-submission storage

- [x] 1.1 Add `comment_email_confirmation_enabled` and `oauth_login_enabled` to bindings, the config registry, runtime flag resolution, bootstrap/config payloads, and Admin → Settings; verify the settings and config tests cover defaults, overrides, and reset behavior, and run `npm run config:check`.
- [x] 1.2 Add a forward-only D1 migration and query helpers for pending comment submissions, hashed confirmation tokens, expiry, and idempotent promotion; verify migration and query tests cover token lookup, expiry, duplicate confirmation, and cleanup.
- [x] 1.3 Add per-address pending limits, shared global confirmation-send reservations/refunds, and scheduled removal of expired submissions; verify email-budget and scheduled-job tests cover exhausted budgets, provider failure, and deletion of expired data, and document limits and retention in `AGENTS-OPERATE.md`.

## 2. Comment submission and confirmation API

- [x] 2.1 Branch `POST /api/v1/comments` on confirmation mode, require and normalize email, preserve existing validation/Turnstile/rate/spam checks, store a private candidate, and send the confirmation email; verify route tests cover accepted responses, missing email/config, send failure cleanup, and public invisibility before confirmation.
- [x] 2.2 Add the read-only confirmation GET and explicit same-origin POST that validates the token, rechecks thread and reply eligibility, and promotes the candidate once; verify tests cover link scanners, invalid/expired tokens, duplicate or concurrent submissions, closed threads, and invalid parents.
- [x] 2.3 Run cache invalidation, spam-verdict persistence, webhooks, subscriber notifications, and moderator notifications only after successful promotion using the saved spam outcome; verify route tests prove each side effect runs once and only for the matching approved or moderation-pending outcome.
- [x] 2.4 Add localized email and confirmation-page copy and document the confirmation lifecycle and failure behavior in `AGENTS-OPERATE.md`; verify all shipped server locales have the required keys and the confirmation-page rendering tests pass.

## 3. Widget and OAuth pause controls

- [x] 3.1 Update the composer to require an email while confirmation mode is active, prefill an available session email without skipping confirmation, and handle the accepted/check-your-inbox response without rendering a comment echo; verify widget tests cover anonymous and signed-in forms, success, validation errors, and disabled-mode compatibility.
- [x] 3.2 Add localized widget strings for the email field, confirmation notice, and recoverable failures; verify widget translation coverage and bundle generation include every shipped locale.
- [x] 3.3 Enforce the OAuth flag in provider configuration, start, callback, and handoff exchange; verify auth tests cover pause/resume, in-flight callbacks and handoffs, hidden provider buttons, and continued validity of existing sessions.
- [x] 3.4 Add the OAuth pause warning and recovery instructions to Admin → Settings and operator docs; verify the rendered settings page warns about admin lockout and the documented recovery path works with an environment default.

## 4. Integration verification

- [x] 4.1 Run `npm run typecheck`, `npm test`, `npm run config:check`, and `npm run manifest:check`; resolve failures and verify the final diff contains only the planned implementation, tests, generated assets, and documentation.
