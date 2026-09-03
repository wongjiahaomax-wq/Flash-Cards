CREATE TABLE `free_review_completion_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	`resulting_free_times_studied` integer NOT NULL,
	`expires_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer) + 604800000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `free_review_completion_receipts_count_check` CHECK (`resulting_free_times_studied` >= 1),
	CONSTRAINT `free_review_completion_receipts_expiry_check` CHECK (`expires_at` > `completed_at`)
);
--> statement-breakpoint
CREATE INDEX `free_review_completion_receipts_expiry_idx` ON `free_review_completion_receipts` (`expires_at`,`user_id`,`id`);
--> statement-breakpoint
CREATE INDEX `free_review_completion_receipts_user_idx` ON `free_review_completion_receipts` (`user_id`,`id`);
--> statement-breakpoint
CREATE TRIGGER `free_review_completion_receipts_active_guard`
BEFORE INSERT ON `free_review_completion_receipts`
BEGIN
	SELECT (CASE WHEN NOT EXISTS (
		SELECT 1
		FROM `active_reviews` a
		WHERE a.`id` = NEW.`id`
			AND a.`user_id` = NEW.`user_id`
			AND a.`case_id` = NEW.`case_id`
			AND a.`study_mode` = 'free'
	) THEN RAISE(ABORT, 'free_completion_active_review_changed') END);

	SELECT (CASE WHEN NOT EXISTS (
		SELECT 1
		FROM `active_reviews` a
		WHERE a.`id` = NEW.`id`
			AND a.`user_id` = NEW.`user_id`
			AND a.`revealed_at` IS NOT NULL
	) THEN RAISE(ABORT, 'free_completion_unrevealed') END);

	SELECT (CASE WHEN NOT EXISTS (
		SELECT 1
		FROM `active_reviews` a
		WHERE a.`id` = NEW.`id`
			AND a.`user_id` = NEW.`user_id`
			AND a.`expires_at` > cast((julianday('now') - 2440587.5) * 86400000 as integer)
	) THEN RAISE(ABORT, 'free_completion_expired') END);
END;
--> statement-breakpoint
CREATE TRIGGER `active_reviews_free_completion_expiry_guard`
BEFORE DELETE ON `active_reviews`
WHEN OLD.`study_mode` = 'free'
	AND EXISTS (
		SELECT 1
		FROM `free_review_completion_receipts` r
		WHERE r.`id` = OLD.`id` AND r.`user_id` = OLD.`user_id`
	)
	AND OLD.`expires_at` <= cast((julianday('now') - 2440587.5) * 86400000 as integer)
BEGIN
	SELECT RAISE(ABORT, 'free_completion_expired');
END;
