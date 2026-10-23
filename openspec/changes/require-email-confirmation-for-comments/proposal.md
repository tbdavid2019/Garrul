# Proposal

## Why

Garrul currently lets a visitor submit a comment without proving control of an email inbox, while OAuth sign-in is the only account sign-in path. Requiring an explicit email confirmation before a comment becomes public will verify the poster's inbox and allow operators to pause OAuth sign-in temporarily without deleting provider credentials.

## What Changes

- Add an operator-controlled mode that requires every new comment to include an email address and remain private until the recipient explicitly confirms it.
- Send a one-time confirmation link and publish the comment only after confirmation; comments flagged by existing spam checks still require moderator approval.
- Add bounded confirmation email sending and cleanup for expired, unconfirmed submissions.
- Add an operator-controlled switch to pause all OAuth sign-in providers without removing their credentials. The widget will hide provider buttons and the Worker will refuse new OAuth starts and callbacks while paused.
- Preserve existing sessions while OAuth sign-in is paused. Existing users can continue using their session until they sign out or it expires; no new OAuth session can be created while paused.
- Keep the existing anonymous/OAuth comment flow available when email confirmation mode is disabled.

## Capabilities

### New Capabilities

- `comment-email-confirmation`: Require mailbox confirmation before a submitted comment can become public, while preserving the existing moderation and spam decisions.
- `oauth-login-control`: Allow an operator to pause and resume new OAuth login flows across all configured providers.

### Modified Capabilities

None.

## Impact

- `src/routes/api.comments.ts`, `src/routes/api.subscriptions.ts` or a dedicated confirmation route, and `src/db/queries.ts` for pending comment confirmation and publication.
- A forward-only D1 migration for confirmation records and expiration/cleanup state.
- `src/widget/embed.ts`, widget translations, and public config for the email field, confirmation response, and OAuth provider visibility.
- `src/routes/auth.ts`, `src/routes/api.config.ts`, settings/config registry, and admin settings for the OAuth pause control.
- Existing spam verdicts, comment notifications, and moderator queue behavior must remain consistent: unconfirmed comments are private, spam-flagged comments remain queued after confirmation, and subscriber notifications only follow public approval.
- Email confirmation depends on configured outbound email (`EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM`, and `PUBLIC_BASE_URL`); comment submission must fail closed when those settings cannot send a confirmation message.
