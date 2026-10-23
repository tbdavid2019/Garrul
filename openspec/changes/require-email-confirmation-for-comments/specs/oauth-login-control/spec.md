# Spec Delta

## Purpose

Give operators a reversible way to pause all OAuth sign-in providers without deleting their credentials, while keeping already-issued sessions usable during the pause.

## ADDED Requirements

### Requirement: Operators can pause and resume OAuth sign-in

The system MUST let an authorized operator disable or re-enable new OAuth sign-in across all configured providers without deleting provider credentials.

#### Scenario: Operator pauses OAuth sign-in
- **WHEN** an authorized operator disables OAuth sign-in
- **THEN** the pause takes effect for every configured OAuth provider
- **AND** the provider credentials remain configured for later re-enablement

#### Scenario: Operator resumes OAuth sign-in
- **WHEN** an authorized operator re-enables OAuth sign-in while provider credentials are configured
- **THEN** the configured providers become available for new sign-in flows

### Requirement: Paused OAuth providers are unavailable for new sign-in

While OAuth sign-in is paused, the system MUST omit OAuth providers from public widget configuration and MUST refuse OAuth start, callback, and handoff-session-exchange requests without creating a session.

#### Scenario: Widget loads while OAuth is paused
- **WHEN** the widget requests public configuration while OAuth sign-in is paused
- **THEN** the configuration lists no OAuth providers
- **AND** the widget renders no OAuth sign-in buttons

#### Scenario: A new OAuth flow is requested while paused
- **WHEN** a client requests an OAuth start or callback route, or exchanges a previously issued OAuth handoff token, while OAuth sign-in is paused
- **THEN** the Worker rejects the flow and does not create a session

### Requirement: Pausing OAuth does not revoke existing sessions

Pausing OAuth sign-in MUST leave sessions issued before the pause valid until they are explicitly revoked or expire under the existing session policy.

#### Scenario: A signed-in reader uses an existing session
- **WHEN** a reader with a valid pre-existing session posts a comment or uses another session-protected feature while OAuth sign-in is paused
- **THEN** the Worker continues to authorize the request under the existing session rules

#### Scenario: An existing session is revoked or expires
- **WHEN** an existing session is explicitly revoked or reaches its existing expiration condition
- **THEN** OAuth sign-in remains paused and the session cannot be renewed through an OAuth flow until an operator resumes sign-in
