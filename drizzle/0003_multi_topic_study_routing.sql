CREATE TABLE `reviews_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`primary_concept_id` text NOT NULL,
	`study_concept_id` text NOT NULL,
	`case_title_snapshot` text NOT NULL,
	`vignette_snapshot_md` text,
	`status` text DEFAULT 'started' NOT NULL,
	`rating` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revealed_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`primary_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`study_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `reviews_status_check` CHECK(`status` in ('started', 'completed')),
	CONSTRAINT `reviews_rating_check` CHECK(`rating` is null or `rating` in ('again', 'good'))
);
INSERT INTO `reviews_new` (
	`id`, `user_id`, `case_id`, `primary_concept_id`, `study_concept_id`,
	`case_title_snapshot`, `vignette_snapshot_md`, `status`, `rating`,
	`started_at`, `revealed_at`, `completed_at`
)
SELECT
	`id`, `user_id`, `case_id`, `primary_concept_id`, `primary_concept_id`,
	`case_title_snapshot`, `vignette_snapshot_md`, `status`, `rating`,
	`started_at`, `revealed_at`, `completed_at`
FROM `reviews`;

CREATE TABLE `review_questions_new` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`question_prompt_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_concept_id` text,
	`source_stimulus_group_id` text,
	`source_stimulus_option_id` text,
	`display_order` integer NOT NULL,
	`prompt_snapshot_md` text NOT NULL,
	`answer_snapshot_md` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews_new`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_stimulus_group_id`) REFERENCES `stimulus_groups`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_stimulus_option_id`) REFERENCES `stimulus_group_options`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `review_questions_source_type_check` CHECK(`source_type` in ('case', 'concept', 'ancestor_concept', 'stimulus_group', 'stimulus_option')),
	CONSTRAINT `review_questions_display_order_nonnegative` CHECK(`display_order` >= 0)
);
INSERT INTO `review_questions_new` (
	`id`, `review_id`, `question_prompt_id`, `source_type`, `source_concept_id`,
	`source_stimulus_group_id`, `source_stimulus_option_id`, `display_order`,
	`prompt_snapshot_md`, `answer_snapshot_md`
)
SELECT
	`id`, `review_id`, `question_prompt_id`, `source_type`, `source_concept_id`,
	`source_stimulus_group_id`, `source_stimulus_option_id`, `display_order`,
	`prompt_snapshot_md`, `answer_snapshot_md`
FROM `review_questions`;

CREATE TABLE `review_assets_new` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`display_order` integer NOT NULL,
	`storage_key_snapshot` text NOT NULL,
	`caption_snapshot_md` text,
	`alt_text_snapshot` text,
	`source_stimulus_group_id` text,
	`source_stimulus_option_id` text,
	FOREIGN KEY (`review_id`) REFERENCES `reviews_new`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_stimulus_group_id`) REFERENCES `stimulus_groups`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_stimulus_option_id`) REFERENCES `stimulus_group_options`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `review_assets_display_order_nonnegative` CHECK(`display_order` >= 0)
);
INSERT INTO `review_assets_new` (
	`id`, `review_id`, `asset_id`, `display_order`, `storage_key_snapshot`,
	`caption_snapshot_md`, `alt_text_snapshot`,
	`source_stimulus_group_id`, `source_stimulus_option_id`
)
SELECT
	`id`, `review_id`, `asset_id`, `display_order`, `storage_key_snapshot`,
	`caption_snapshot_md`, `alt_text_snapshot`,
	`source_stimulus_group_id`, `source_stimulus_option_id`
FROM `review_assets`;

DROP TABLE `review_questions`;
DROP TABLE `review_assets`;
DROP TABLE `reviews`;
ALTER TABLE `reviews_new` RENAME TO `reviews`;
ALTER TABLE `review_questions_new` RENAME TO `review_questions`;
ALTER TABLE `review_assets_new` RENAME TO `review_assets`;

CREATE INDEX `reviews_user_completed_idx` ON `reviews` (`user_id`, `completed_at`);
CREATE INDEX `reviews_case_completed_idx` ON `reviews` (`case_id`, `completed_at`);
CREATE INDEX `reviews_concept_completed_idx` ON `reviews` (`primary_concept_id`, `completed_at`);
CREATE INDEX `reviews_study_concept_completed_idx` ON `reviews` (`study_concept_id`, `completed_at`);
CREATE UNIQUE INDEX `review_questions_review_order_unique` ON `review_questions` (`review_id`, `display_order`);
CREATE UNIQUE INDEX `review_questions_review_prompt_unique` ON `review_questions` (`review_id`, `question_prompt_id`);
CREATE INDEX `review_questions_prompt_idx` ON `review_questions` (`question_prompt_id`);
CREATE UNIQUE INDEX `review_assets_review_order_unique` ON `review_assets` (`review_id`, `display_order`);
CREATE UNIQUE INDEX `review_assets_review_asset_unique` ON `review_assets` (`review_id`, `asset_id`);
