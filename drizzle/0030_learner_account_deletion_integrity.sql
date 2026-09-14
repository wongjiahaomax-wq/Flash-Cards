-- A confirmed learner deletion and a Production role change must be mutually
-- exclusive at the database boundary. Application prechecks remain useful for
-- friendly errors, but they cannot close a commit-order race on their own.

CREATE TRIGGER `learner_account_deletions_target_guard`
BEFORE INSERT ON `learner_account_deletions`
WHEN NOT EXISTS (
	SELECT 1
	FROM `user`
WHERE `id` = NEW.`user_id`
      AND (`role` IS NULL OR `role` = 'user')
)
BEGIN
	SELECT RAISE(ABORT, 'LEARNER_ACCOUNT_DELETION_TARGET_NOT_LEARNER');
END;
--> statement-breakpoint

CREATE TRIGGER `user_learner_account_deletion_role_guard`
BEFORE UPDATE OF `role` ON `user`
WHEN coalesce(OLD.`role`, '') <> coalesce(NEW.`role`, '')
	AND EXISTS (
		SELECT 1
		FROM `learner_account_deletions`
		WHERE `user_id` = OLD.`id`
	)
BEGIN
	SELECT RAISE(ABORT, 'LEARNER_ACCOUNT_DELETION_IN_PROGRESS');
END;
