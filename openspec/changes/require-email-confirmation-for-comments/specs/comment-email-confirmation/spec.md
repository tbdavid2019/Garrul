# Spec Delta

## Purpose

Require a commenter to prove control of an email inbox before their submitted comment can become public, while preserving Garrul's existing spam and moderation decisions.

## ADDED Requirements

### Requirement: Operators can enable email confirmation for comment posting

When email-confirmation mode is enabled, every new comment MUST require a valid email address and inbox confirmation, including submissions from existing signed-in sessions. When the mode is disabled, comment posting MUST retain its existing behavior.

#### Scenario: Confirmation mode is enabled
- **WHEN** a visitor submits a comment without a valid email address
- **THEN** the system rejects the submission and does not create a comment

#### Scenario: Confirmation mode is disabled
- **WHEN** a visitor submits a comment using the existing anonymous or signed-in flow
- **THEN** the system handles the comment according to the existing posting behavior

### Requirement: Unconfirmed comments remain private

The system MUST keep a submitted comment unavailable to public comment trees, feeds, permalinks, public APIs, webhooks, and subscriber notifications until its email confirmation succeeds.

#### Scenario: A comment awaits email confirmation
- **WHEN** the system accepts a comment submission and sends a confirmation message
- **THEN** the widget tells the commenter to check their inbox
- **AND** public readers cannot retrieve or see that comment
- **AND** subscribers and moderators are not notified that it was posted

#### Scenario: Email confirmation cannot be sent
- **WHEN** outbound email is unconfigured or the email provider fails to accept the confirmation message
- **THEN** the system rejects the submission with a recoverable error
- **AND** it does not leave an unconfirmable comment available for publication

### Requirement: Email confirmation requires an explicit recipient action

The system MUST use a high-entropy, expiring, single-use confirmation capability and MUST NOT publish a comment from a `GET` request alone.

#### Scenario: A mail scanner follows the link
- **WHEN** a mail client or link scanner requests the confirmation URL with `GET`
- **THEN** the system displays a confirmation action without publishing the comment

#### Scenario: The recipient confirms the comment
- **WHEN** the recipient submits the confirmation action with a valid unexpired token
- **THEN** the system confirms the email address and makes the comment eligible for publication
- **AND** repeating the same confirmation action does not create duplicate comments or notifications

#### Scenario: The token is expired or invalid
- **WHEN** a confirmation action uses an expired, unknown, or already spent token
- **THEN** the system does not publish a comment or disclose whether an email address has submitted a comment

### Requirement: Confirmation preserves spam moderation outcomes

After inbox confirmation, the system MUST apply the original spam decision: comments that pass spam checks become public, while comments held by existing spam or moderation rules remain pending moderator approval.

#### Scenario: Confirmed comment passes spam checks
- **WHEN** a recipient confirms a comment that passed the existing spam checks
- **THEN** the comment becomes public
- **AND** subscriber notifications are queued only after publication

#### Scenario: Confirmed comment was flagged
- **WHEN** a recipient confirms a comment that existing spam rules held for review
- **THEN** the comment remains hidden from public readers in the moderation queue
- **AND** the normal moderator notification behavior applies

### Requirement: Confirmation revalidates the target thread

Before publishing a confirmed submission, the system MUST verify that its target thread still accepts comments and that any reply target remains valid for that thread.

#### Scenario: The target thread closes while confirmation is pending
- **WHEN** a recipient confirms a submission after its thread has closed
- **THEN** the system does not publish the comment
- **AND** the confirmation page reports that the comment could not be posted

### Requirement: Confirmation email sending is bounded

The system MUST apply request and outbound-email limits before accepting comment confirmations, including limits that remain effective when requests rotate through different email addresses.

#### Scenario: A confirmation-send limit is exhausted
- **WHEN** a submission would exceed an applicable per-address, per-request, or global send limit
- **THEN** the system rejects it without storing an unconfirmable submission or sending an email

### Requirement: Unconfirmed submissions expire

The system MUST expire and remove unconfirmed comment submissions and their confirmation capabilities after a bounded retention period.

#### Scenario: An unconfirmed submission reaches its expiry
- **WHEN** its confirmation period ends without recipient action
- **THEN** the system cannot publish it using its former token
- **AND** the unconfirmed comment content and token are removed according to the configured retention policy

### Requirement: Commenter email addresses remain private

The system MUST NOT include a commenter's email address in public comment payloads, feeds, permalinks, or public engagement responses.

#### Scenario: A confirmed comment is served publicly
- **WHEN** a public reader retrieves a confirmed comment
- **THEN** the response contains the existing public author fields and does not contain the commenter's email address
