-- Private comment drafts awaiting inbox confirmation.
-- Forward-only. Never edit after a deployment; create a new migration instead.
--
-- These rows are deliberately separate from `comments`: comments.status =
-- 'pending' already means moderator review, while an unconfirmed submission
-- must not appear in the public tree or the moderation queue.

CREATE TABLE IF NOT EXISTS pending_comment_submissions (
	id                  TEXT PRIMARY KEY,
	post_slug           TEXT NOT NULL REFERENCES posts(slug),
	parent_id           TEXT REFERENCES comments(id),
	user_id             TEXT NOT NULL REFERENCES users(id),
	body_md             TEXT NOT NULL,
	body_html           TEXT NOT NULL,
	renderer_version    INTEGER NOT NULL,
	status_after_confirm TEXT NOT NULL CHECK (status_after_confirm IN ('approved', 'pending')),
	ip_hash             TEXT,
	user_agent          TEXT,
	depth               INTEGER NOT NULL,
	email               TEXT NOT NULL,
	token_hash          TEXT NOT NULL UNIQUE,
	spam_verdicts_json  TEXT NOT NULL DEFAULT '[]',
	created_at          INTEGER NOT NULL,
	expires_at          INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS pending_comment_email_expiry_idx
	ON pending_comment_submissions(email, expires_at);
CREATE INDEX IF NOT EXISTS pending_comment_expiry_idx
	ON pending_comment_submissions(expires_at);
