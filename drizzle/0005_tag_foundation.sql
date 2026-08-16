CREATE TABLE `tags` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tags_normalized_name_unique` ON `tags` (`normalized_name`);--> statement-breakpoint
CREATE INDEX `tags_active_name_idx` ON `tags` (`is_active`,`name`);--> statement-breakpoint
CREATE TABLE `case_tags` (
	`case_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`case_id`, `tag_id`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `case_tags_tag_case_idx` ON `case_tags` (`tag_id`,`case_id`);--> statement-breakpoint
CREATE TABLE `case_question_tags` (
	`case_question_id` text NOT NULL,
	`tag_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`case_question_id`, `tag_id`),
	FOREIGN KEY (`case_question_id`) REFERENCES `case_questions`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `case_question_tags_tag_question_idx` ON `case_question_tags` (`tag_id`,`case_question_id`);
