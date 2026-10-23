# Design

## Context

See `proposal.md` for the motivation and `specs/comment-email-confirmation/spec.md` plus `specs/oauth-login-control/spec.md` for the observable contract.

The current comment POST validates and inserts a comment in one request, then returns a 201 echo that the widget renders immediately. Its `pending` status means moderator review. Email subscriptions already use a one-time link whose GET renders a confirmation form and whose POST performs the write. Runtime settings already resolve as database override, then environment value, then default. OAuth provider buttons come from the configured provider credentials, and an OAuth callback can issue both a session cookie and a short-lived handoff token for `/session/exchange`.

## Goals / Non-Goals

**Goals:**

- Keep the existing comment path unchanged when email-confirmation mode is off.
- Gate every new comment on an explicit inbox confirmation when the mode is on, while preserving the spam decision made at submission time.
- Pause every configured OAuth provider through a reversible operator control without revoking current sessions or deleting credentials.
- Keep email addresses and unconfirmed content out of public comment surfaces.

**Non-Goals:**

- Create passwordless email accounts or issue a login session from a comment confirmation. Confirmation proves the inbox for that submission only; session-protected edit/delete and admin actions keep their current authentication rules.
- Revoke or shorten existing sessions when OAuth sign-in is paused.
- Change the existing comment moderation policy or retroactively gate comments already in D1.

## Decisions

### Use two runtime flags with compatibility-preserving defaults

Add `comment_email_confirmation_enabled` (default `false`) and `oauth_login_enabled` (default `true`) to the existing runtime flag system. Expose both through the public config/bootstrap payload where the widget needs them, add operator controls in Admin → Settings, and register environment defaults so an operator can recover a setting without deleting provider secrets. Database overrides continue to take precedence over environment defaults.

When OAuth is paused, `api.config` and bootstrap return an empty provider list. Enforce the same flag at OAuth start, callback, and handoff exchange so a flow started before the pause cannot mint a session afterward. Do not change `/auth/me`, sign-out, or ordinary reads/actions for sessions that already exist. If an administrator loses the active session while OAuth remains paused, the operator can clear the `oauth_login_enabled` database override or set it true through the environment and redeploy; document this recovery path.

### Store unconfirmed submissions outside the comments table

Add an additive D1 table for pending comment submissions rather than adding an `unverified` status to `comments`. The table holds the candidate comment fields, normalized destination email, intended comment ID, spam outcome/verdict data, hashed confirmation token, creation time, and expiry time. This keeps unconfirmed content out of the moderation queue and avoids overloading `comments.status = 'pending'`, which already means moderator review.

The comment POST keeps its current validation order, thread checks, Turnstile verification, rate limits, and spam evaluation. In confirmation mode, it reserves outbound email budget, evaluates spam once, stores the candidate, and sends the confirmation email. If email sending fails, it removes the candidate and releases the reservation. A successful request returns an accepted/check-your-inbox response rather than a public comment echo. Use the submitted email as the classifier's email input without adding it to public author fields.

### Promote only after a deliberate, single-use confirmation

Use a dedicated comment-confirmation route. Its GET renders a small confirmation form and performs no write. The same-origin POST checks the token hash and expiry, revalidates that the thread is still open and the reply target is still valid, then promotes the candidate to a normal comment using its preassigned ID. The promotion and token consumption must be idempotent under retries and concurrent clicks. Expired or invalid tokens receive a generic page and cannot reveal prior submissions.

After promotion, run the existing post-insert side effects once: persist the saved spam verdicts, invalidate the thread cache, emit the posted event/webhook, notify subscribers only for an approved comment, and notify moderators only for a comment still held for review. Do not emit these effects for a candidate that has not been confirmed. A closed thread or invalid reply target consumes or invalidates the confirmation attempt without creating a public comment.

### Reuse the confirmation mail controls, with a per-address pending cap

Reuse the existing `sendEmail` adapter and atomic global confirmation-send budget so comment confirmations and subscription confirmations share one outbound ceiling. Add a small cap on simultaneous unconfirmed comment submissions per normalized email, in addition to the existing IP/user posting limits. Reserve budget before persisting a candidate, and refund it if the provider rejects the send. This keeps address rotation from bypassing the global limit and prevents unusable drafts from consuming capacity.

The shared budget can temporarily deny subscription-confirmation mail when comment traffic reaches the ceiling. This is accepted to maintain one global bound on confirmation mail. If operators later need separate service levels, separate budgets can be considered as a follow-up.

### Expire pending data through the scheduled retention path

Give confirmation links a 24-hour lifetime. Add a bounded cleanup pass to the existing scheduled worker to delete expired unconfirmed rows and their stored comment bodies, emails, tokens, and verdict data. Delete a candidate row after successful promotion as well; the normal `comments` row retains only its existing author fields and no submitted email address.

### Make the widget follow server configuration

When confirmation mode is active, add a required email input for both anonymous and signed-in composers. Prefill it from `me.email` when available, but still require the explicit email click for every comment. On the accepted response, clear the draft and show a localized check-your-inbox status; do not render an unconfirmed comment from the response. Preserve Turnstile and existing form timing checks.

Add widget strings for the email field, accepted state, and relevant failure states in the shipped widget locales. Add server-side localized email and confirmation-page strings through the existing locale tables. The confirmation page links back to the stored canonical post URL when available.

## Risks / Trade-offs

- **Email delivery failure blocks new comments while confirmation mode is enabled** → fail closed, return a recoverable message, refund reserved send budget, and expose the failure in logs without logging addresses or comment bodies.
- **Mail scanners can activate links automatically** → keep GET read-only and require the recipient's explicit POST action.
- **Confirmation adds friction and does not create a logged-in author identity** → state clearly that the email verifies one submission; retain the existing authentication rules for edits, deletes, and admin actions.
- **Comment confirmations can consume capacity otherwise used by subscription confirmations** → share the existing atomic global limit and make exhaustion visible to operators.
- **OAuth pause can prevent a later admin login after the current session expires** → preserve current sessions, keep credentials configured, provide the documented setting recovery path, and show a warning in Admin → Settings before pausing OAuth.
- **Deploying an older Worker during an OAuth pause would ignore the new flag** → the rollback procedure must temporarily remove provider credentials if the pause must stay in force, then restore the credentials after the new version is redeployed.

## Migration Plan

1. Add the pending-submission table and indexes with a new forward-only migration. The default runtime values keep existing posting and OAuth behavior unchanged.
2. Deploy the Worker and widget changes, then verify outbound email configuration before enabling confirmation mode.
3. Enable `comment_email_confirmation_enabled` and pause OAuth through Admin → Settings. Existing comments and sessions remain intact.
4. To roll back behavior without reverting code, disable email-confirmation mode and re-enable OAuth. Expired candidates are removed by the scheduled cleanup; already-confirmed comments stay normal comments.
5. If code must be rolled back while OAuth must remain paused, remove the configured OAuth provider credentials for that rollback window because the older Worker does not understand the new flag.

## Open Questions

None. The initial link lifetime is 24 hours, and email confirmation remains a per-comment proof rather than an account login.
