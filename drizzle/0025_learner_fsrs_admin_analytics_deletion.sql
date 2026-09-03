CREATE TABLE `learner_system_monthly_buckets` (
	`user_id` text NOT NULL,
	`system_id` text NOT NULL,
	`month_start` integer NOT NULL,
	`scheduled_completed` integer DEFAULT 0 NOT NULL,
	`scheduled_again` integer DEFAULT 0 NOT NULL,
	`scheduled_hard` integer DEFAULT 0 NOT NULL,
	`scheduled_good` integer DEFAULT 0 NOT NULL,
	`scheduled_easy` integer DEFAULT 0 NOT NULL,
	`first_completed_at` integer NOT NULL,
	`last_completed_at` integer NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `system_id`, `month_start`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_system_monthly_buckets_counts_check` CHECK (
		`scheduled_completed` >= 0
		and `scheduled_again` >= 0
		and `scheduled_hard` >= 0
		and `scheduled_good` >= 0
		and `scheduled_easy` >= 0
	),
	CONSTRAINT `learner_system_monthly_buckets_time_check` CHECK (
		`month_start` >= 0
		and `first_completed_at` >= `month_start`
		and `last_completed_at` >= `first_completed_at`
	)
);
--> statement-breakpoint
CREATE INDEX `learner_system_monthly_buckets_user_month_idx`
	ON `learner_system_monthly_buckets` (`user_id`,`month_start`,`system_id`);
--> statement-breakpoint
CREATE INDEX `learner_system_monthly_buckets_system_month_idx`
	ON `learner_system_monthly_buckets` (`system_id`,`month_start`,`user_id`);
--> statement-breakpoint
CREATE INDEX `learner_system_monthly_buckets_month_idx`
	ON `learner_system_monthly_buckets` (`month_start`,`system_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `learner_account_deletions` (
	`user_id` text PRIMARY KEY NOT NULL,
	`phase` text DEFAULT 'active_reviews' NOT NULL,
	`requested_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`batches_completed` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_account_deletions_phase_check` CHECK (`phase` in (
		'active_reviews',
		'free_receipts',
		'scheduled_events',
		'optimizer_evidence',
		'case_state',
		'case_encounters',
		'monthly_buckets',
		'system_aggregates',
		'learner_aggregates',
		'preferences',
		'profile',
		'identity_ready'
	)),
	CONSTRAINT `learner_account_deletions_batches_check` CHECK (`batches_completed` >= 0)
);
--> statement-breakpoint
CREATE TRIGGER `concepts_fsrs_system_monthly_history_kind_guard`
BEFORE UPDATE OF `kind` ON `concepts`
WHEN OLD.`kind` = 'system'
	AND NEW.`kind` <> 'system'
	AND EXISTS (
		SELECT 1 FROM `learner_system_monthly_buckets` b WHERE b.`system_id` = OLD.`id`
	)
BEGIN
	SELECT RAISE(ABORT, 'System has durable learner FSRS monthly history and cannot be reclassified.');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_fsrs_system_monthly_history_delete_guard`
BEFORE DELETE ON `concepts`
WHEN OLD.`kind` = 'system'
	AND EXISTS (
		SELECT 1 FROM `learner_system_monthly_buckets` b WHERE b.`system_id` = OLD.`id`
	)
BEGIN
	SELECT RAISE(ABORT, 'System has durable learner FSRS monthly history and cannot be deleted.');
END;
--> statement-breakpoint
CREATE TRIGGER `session_learner_account_deletion_guard`
BEFORE INSERT ON `session`
WHEN EXISTS (
	SELECT 1 FROM `learner_account_deletions` d WHERE d.`user_id` = NEW.`userId`
)
BEGIN
	SELECT RAISE(ABORT, 'learner_account_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `active_reviews_learner_account_deletion_guard`
BEFORE INSERT ON `active_reviews`
WHEN EXISTS (
	SELECT 1 FROM `learner_account_deletions` d WHERE d.`user_id` = NEW.`user_id`
)
BEGIN
	SELECT RAISE(ABORT, 'learner_account_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `user_learner_data_staged_delete_guard`
BEFORE DELETE ON `user`
WHEN (OLD.`role` IS NULL OR OLD.`role` = 'user')
	AND (
		EXISTS (SELECT 1 FROM `learner_preferences` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `learner_fsrs_profiles` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `learner_case_fsrs` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `learner_case_encounters` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `scheduled_review_events` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `learner_optimizer_evidence` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `learner_aggregates` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `learner_system_aggregates` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `learner_system_monthly_buckets` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `active_reviews` x WHERE x.`user_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `free_review_completion_receipts` x WHERE x.`user_id` = OLD.`id`)
	)
BEGIN
	SELECT RAISE(ABORT, 'learner_account_requires_staged_deletion');
END;
