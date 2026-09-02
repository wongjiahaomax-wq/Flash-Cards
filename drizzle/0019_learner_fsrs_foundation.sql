CREATE TABLE `learner_preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`expanded_learning` integer DEFAULT 0 NOT NULL,
	`scheduled_order` text DEFAULT 'due_first' NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_preferences_expanded_learning_check` CHECK (`expanded_learning` in (0, 1)),
	CONSTRAINT `learner_preferences_scheduled_order_check` CHECK (`scheduled_order` in ('due_first', 'new_first'))
);
--> statement-breakpoint
CREATE TABLE `learner_fsrs_profiles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`generation` integer DEFAULT 1 NOT NULL,
	`review_sequence_epoch` integer DEFAULT 1 NOT NULL,
	`parameter_revision` integer DEFAULT 1 NOT NULL,
	`scheduler_revision` integer DEFAULT 1 NOT NULL,
	`scheduler_library_version` text NOT NULL,
	`parameters_json` text NOT NULL,
	`detailed_history_retention` text DEFAULT '24m' NOT NULL,
	`last_optimized_at` integer,
	`last_detailed_cleanup_at` integer,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_fsrs_profiles_generation_check` CHECK (`generation` >= 1),
	CONSTRAINT `learner_fsrs_profiles_review_sequence_epoch_check` CHECK (`review_sequence_epoch` >= 1),
	CONSTRAINT `learner_fsrs_profiles_parameter_revision_check` CHECK (`parameter_revision` >= 1),
	CONSTRAINT `learner_fsrs_profiles_scheduler_revision_check` CHECK (`scheduler_revision` >= 1),
	CONSTRAINT `learner_fsrs_profiles_history_retention_check` CHECK (`detailed_history_retention` in ('24m', '36m', '60m', 'indefinite'))
);
--> statement-breakpoint
CREATE TABLE `learner_case_fsrs` (
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`due_at` integer NOT NULL,
	`stability` real DEFAULT 0 NOT NULL,
	`difficulty` real DEFAULT 0 NOT NULL,
	`state` integer DEFAULT 0 NOT NULL,
	`elapsed_days` integer DEFAULT 0 NOT NULL,
	`scheduled_days` integer DEFAULT 0 NOT NULL,
	`learning_steps` integer DEFAULT 0 NOT NULL,
	`reps` integer DEFAULT 0 NOT NULL,
	`lapses` integer DEFAULT 0 NOT NULL,
	`last_review_at` integer,
	`generation` integer NOT NULL,
	`review_sequence_epoch` integer NOT NULL,
	`parameter_revision` integer NOT NULL,
	`scheduler_revision` integer NOT NULL,
	`scheduler_library_version` text NOT NULL,
	`state_revision` integer DEFAULT 1 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `case_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_case_fsrs_state_check` CHECK (`state` between 0 and 3),
	CONSTRAINT `learner_case_fsrs_counter_check` CHECK (`elapsed_days` >= 0 and `scheduled_days` >= 0 and `learning_steps` >= 0 and `reps` >= 0 and `lapses` >= 0),
	CONSTRAINT `learner_case_fsrs_boundary_check` CHECK (`generation` >= 1 and `review_sequence_epoch` >= 1 and `parameter_revision` >= 1 and `scheduler_revision` >= 1 and `state_revision` >= 1)
);
--> statement-breakpoint
CREATE INDEX `learner_case_fsrs_due_idx` ON `learner_case_fsrs` (`user_id`,`due_at`,`case_id`);
--> statement-breakpoint
CREATE TABLE `learner_case_encounters` (
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`first_scheduled_completed_at` integer,
	`free_first_seen_at` integer,
	`free_last_seen_at` integer,
	`free_times_studied` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `case_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_case_encounters_free_times_studied_check` CHECK (`free_times_studied` >= 0)
);
--> statement-breakpoint
CREATE INDEX `learner_case_encounters_scheduled_idx` ON `learner_case_encounters` (`user_id`,`first_scheduled_completed_at`,`case_id`);
--> statement-breakpoint
CREATE TABLE `scheduled_review_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`case_title_snapshot` text NOT NULL,
	`system_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	`rating` text NOT NULL,
	`content_mode` text NOT NULL,
	`generation` integer NOT NULL,
	`review_sequence_epoch` integer NOT NULL,
	`sequence_no` integer NOT NULL,
	`parameter_revision` integer NOT NULL,
	`scheduler_revision` integer NOT NULL,
	`scheduler_library_version` text NOT NULL,
	`resulting_state_revision` integer NOT NULL,
	`next_due_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `scheduled_review_events_rating_check` CHECK (`rating` in ('again', 'hard', 'good', 'easy')),
	CONSTRAINT `scheduled_review_events_content_mode_check` CHECK (`content_mode` in ('original', 'expanded')),
	CONSTRAINT `scheduled_review_events_boundary_check` CHECK (`generation` >= 1 and `review_sequence_epoch` >= 1 and `sequence_no` >= 1 and `parameter_revision` >= 1 and `scheduler_revision` >= 1 and `resulting_state_revision` >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `scheduled_review_events_sequence_unique` ON `scheduled_review_events` (`user_id`,`case_id`,`generation`,`review_sequence_epoch`,`sequence_no`);
--> statement-breakpoint
CREATE INDEX `scheduled_review_events_user_completed_idx` ON `scheduled_review_events` (`user_id`,`completed_at`,`id`);
--> statement-breakpoint
CREATE INDEX `scheduled_review_events_user_generation_completed_idx` ON `scheduled_review_events` (`user_id`,`generation`,`completed_at`,`id`);
--> statement-breakpoint
CREATE INDEX `scheduled_review_events_user_system_completed_idx` ON `scheduled_review_events` (`user_id`,`system_id`,`completed_at`,`id`);
--> statement-breakpoint
CREATE TABLE `learner_optimizer_evidence` (
	`event_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`completed_at` integer NOT NULL,
	`rating` text NOT NULL,
	`generation` integer NOT NULL,
	`review_sequence_epoch` integer NOT NULL,
	`sequence_no` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_optimizer_evidence_rating_check` CHECK (`rating` in ('again', 'hard', 'good', 'easy')),
	CONSTRAINT `learner_optimizer_evidence_boundary_check` CHECK (`generation` >= 1 and `review_sequence_epoch` >= 1 and `sequence_no` >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `learner_optimizer_evidence_sequence_unique` ON `learner_optimizer_evidence` (`user_id`,`case_id`,`generation`,`review_sequence_epoch`,`sequence_no`);
--> statement-breakpoint
CREATE INDEX `learner_optimizer_evidence_optimizer_idx` ON `learner_optimizer_evidence` (`user_id`,`generation`,`case_id`,`review_sequence_epoch`,`sequence_no`,`event_id`);
--> statement-breakpoint
CREATE TABLE `learner_aggregates` (
	`user_id` text PRIMARY KEY NOT NULL,
	`scheduled_completed` integer DEFAULT 0 NOT NULL,
	`scheduled_again` integer DEFAULT 0 NOT NULL,
	`scheduled_hard` integer DEFAULT 0 NOT NULL,
	`scheduled_good` integer DEFAULT 0 NOT NULL,
	`scheduled_easy` integer DEFAULT 0 NOT NULL,
	`free_completed` integer DEFAULT 0 NOT NULL,
	`first_activity_at` integer,
	`last_activity_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_aggregates_counts_check` CHECK (`scheduled_completed` >= 0 and `scheduled_again` >= 0 and `scheduled_hard` >= 0 and `scheduled_good` >= 0 and `scheduled_easy` >= 0 and `free_completed` >= 0)
);
--> statement-breakpoint
CREATE TABLE `learner_system_aggregates` (
	`user_id` text NOT NULL,
	`system_id` text NOT NULL,
	`scheduled_completed` integer DEFAULT 0 NOT NULL,
	`scheduled_again` integer DEFAULT 0 NOT NULL,
	`scheduled_hard` integer DEFAULT 0 NOT NULL,
	`scheduled_good` integer DEFAULT 0 NOT NULL,
	`scheduled_easy` integer DEFAULT 0 NOT NULL,
	`first_completed_at` integer,
	`last_completed_at` integer,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`user_id`, `system_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `learner_system_aggregates_counts_check` CHECK (`scheduled_completed` >= 0 and `scheduled_again` >= 0 and `scheduled_hard` >= 0 and `scheduled_good` >= 0 and `scheduled_easy` >= 0)
);
--> statement-breakpoint
CREATE INDEX `learner_system_aggregates_user_idx` ON `learner_system_aggregates` (`user_id`,`system_id`);