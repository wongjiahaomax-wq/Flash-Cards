-- Learner feedback is Case-level durable learner-owned data.
CREATE TABLE learner_feedback (
  id TEXT PRIMARY KEY NOT NULL,
  case_id TEXT NOT NULL REFERENCES cases(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  reporter_label_snapshot TEXT NOT NULL,
  case_title_snapshot TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  reported_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
  reviewed_at INTEGER,
  reviewed_by TEXT,
  CONSTRAINT learner_feedback_status_check CHECK (status IN ('open', 'resolved', 'dismissed')),
  CONSTRAINT learner_feedback_review_metadata_check CHECK (
    (status = 'open' AND reviewed_at IS NULL AND reviewed_by IS NULL)
    OR (status IN ('resolved', 'dismissed') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL)
  )
);
--> statement-breakpoint
CREATE INDEX learner_feedback_status_reported_idx
  ON learner_feedback(status, reported_at, id);
--> statement-breakpoint
CREATE INDEX learner_feedback_case_status_reported_idx
  ON learner_feedback(case_id, status, reported_at, id);
--> statement-breakpoint
CREATE INDEX learner_feedback_user_reported_idx
  ON learner_feedback(user_id, reported_at, id);
--> statement-breakpoint
CREATE TRIGGER learner_feedback_account_deletion_guard
BEFORE INSERT ON learner_feedback
WHEN EXISTS (
  SELECT 1 FROM learner_account_deletions
  WHERE user_id = NEW.user_id
)
BEGIN
  SELECT RAISE(ABORT, 'LEARNER_FEEDBACK_ACCOUNT_DELETION_IN_PROGRESS');
END;
--> statement-breakpoint
CREATE TRIGGER user_learner_feedback_staged_delete_guard
BEFORE DELETE ON user
WHEN (OLD.role IS NULL OR OLD.role = 'user')
  AND EXISTS (
    SELECT 1 FROM learner_feedback WHERE user_id = OLD.id
  )
BEGIN
  SELECT RAISE(ABORT, 'LEARNER_FEEDBACK_REQUIRES_STAGED_DELETION');
END;
