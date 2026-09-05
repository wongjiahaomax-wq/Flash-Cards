CREATE TABLE `learner_study_data_deletions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`phase` text DEFAULT 'active_reviews' NOT NULL,
	`requested_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`batches_completed` integer DEFAULT 0 NOT NULL,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_study_data_deletions_phase_check` CHECK (`phase` in (
		'active_reviews',
		'free_receipts',
		'scheduled_events',
		'optimizer_evidence',
		'case_state',
		'case_encounters',
		'monthly_buckets',
		'system_aggregates',
		'learner_aggregates',
		'legacy_review_questions',
		'legacy_review_assets',
		'legacy_reviews',
		'profile',
		'verify_empty',
		'complete'
	)),
	CONSTRAINT `learner_study_data_deletions_batches_check` CHECK (`batches_completed` >= 0),
	CONSTRAINT `learner_study_data_deletions_completion_check` CHECK (
		(`phase` = 'complete' AND `completed_at` IS NOT NULL)
		OR (`phase` <> 'complete' AND `completed_at` IS NULL)
	)
);
--> statement-breakpoint
CREATE TRIGGER `active_reviews_learner_study_data_deletion_guard`
BEFORE INSERT ON `active_reviews`
WHEN EXISTS (
	SELECT 1
	FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id`
		AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
