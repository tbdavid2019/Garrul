-- Remember the language used in the confirmation email for its landing page.
-- Forward-only. Never edit after a deployment; create a new migration instead.
ALTER TABLE pending_comment_submissions ADD COLUMN locale TEXT;
