ALTER TABLE `cases` ADD COLUMN `question_selection_mode` text NOT NULL DEFAULT 'automatic';
ALTER TABLE `cases` ADD COLUMN `question_count` integer;

CREATE TABLE `stimulus_groups` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`name` text NOT NULL,
	`display_order` integer NOT NULL,
	`selection_count` integer NOT NULL DEFAULT 1,
	`specific_question_mode` text NOT NULL DEFAULT 'none',
	`minimum_specific_questions` integer,
	`is_active` integer NOT NULL DEFAULT true,
	`created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `stimulus_groups_display_order_nonnegative` CHECK(`display_order` >= 0),
	CONSTRAINT `stimulus_groups_selection_count_positive` CHECK(`selection_count` > 0),
	CONSTRAINT `stimulus_groups_specific_mode_check` CHECK(`specific_question_mode` in ('none', 'minimum', 'all')),
	CONSTRAINT `stimulus_groups_minimum_check` CHECK(`minimum_specific_questions` is null or `minimum_specific_questions` > 0)
);
CREATE INDEX `stimulus_groups_case_idx` ON `stimulus_groups` (`case_id`, `display_order`);
CREATE INDEX `stimulus_groups_active_idx` ON `stimulus_groups` (`case_id`, `is_active`);

CREATE TABLE `stimulus_group_options` (
	`id` text PRIMARY KEY NOT NULL,
	`stimulus_group_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`display_order` integer NOT NULL,
	`caption_md` text,
	`is_active` integer NOT NULL DEFAULT true,
	`created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`stimulus_group_id`) REFERENCES `stimulus_groups`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `stimulus_group_options_display_order_nonnegative` CHECK(`display_order` >= 0)
);
CREATE UNIQUE INDEX `stimulus_group_options_group_asset_unique` ON `stimulus_group_options` (`stimulus_group_id`, `asset_id`);
CREATE UNIQUE INDEX `stimulus_group_options_group_order_unique` ON `stimulus_group_options` (`stimulus_group_id`, `display_order`);
CREATE INDEX `stimulus_group_options_asset_idx` ON `stimulus_group_options` (`asset_id`);
CREATE INDEX `stimulus_group_options_active_idx` ON `stimulus_group_options` (`stimulus_group_id`, `is_active`);

CREATE TABLE `stimulus_group_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`stimulus_group_id` text NOT NULL,
	`question_prompt_id` text NOT NULL,
	`answer_md` text NOT NULL,
	`is_active` integer NOT NULL DEFAULT true,
	`created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`stimulus_group_id`) REFERENCES `stimulus_groups`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE UNIQUE INDEX `stimulus_group_questions_group_prompt_unique` ON `stimulus_group_questions` (`stimulus_group_id`, `question_prompt_id`);
CREATE INDEX `stimulus_group_questions_prompt_idx` ON `stimulus_group_questions` (`question_prompt_id`);
CREATE INDEX `stimulus_group_questions_group_active_idx` ON `stimulus_group_questions` (`stimulus_group_id`, `is_active`);

CREATE TABLE `stimulus_option_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`stimulus_group_option_id` text NOT NULL,
	`question_prompt_id` text NOT NULL,
	`answer_md` text NOT NULL,
	`is_active` integer NOT NULL DEFAULT true,
	`created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
	`updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
	FOREIGN KEY (`stimulus_group_option_id`) REFERENCES `stimulus_group_options`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict
);
CREATE UNIQUE INDEX `stimulus_option_questions_option_prompt_unique` ON `stimulus_option_questions` (`stimulus_group_option_id`, `question_prompt_id`);
CREATE INDEX `stimulus_option_questions_prompt_idx` ON `stimulus_option_questions` (`question_prompt_id`);
CREATE INDEX `stimulus_option_questions_option_active_idx` ON `stimulus_option_questions` (`stimulus_group_option_id`, `is_active`);

ALTER TABLE `review_assets` ADD COLUMN `source_stimulus_group_id` text REFERENCES `stimulus_groups`(`id`) ON UPDATE no action ON DELETE restrict;
ALTER TABLE `review_assets` ADD COLUMN `source_stimulus_option_id` text REFERENCES `stimulus_group_options`(`id`) ON UPDATE no action ON DELETE restrict;

PRAGMA foreign_keys=OFF;
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
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_stimulus_group_id`) REFERENCES `stimulus_groups`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_stimulus_option_id`) REFERENCES `stimulus_group_options`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `review_questions_source_type_check` CHECK(`source_type` in ('case', 'concept', 'ancestor_concept', 'stimulus_group', 'stimulus_option')),
	CONSTRAINT `review_questions_display_order_nonnegative` CHECK(`display_order` >= 0)
);
INSERT INTO `review_questions_new` (`id`, `review_id`, `question_prompt_id`, `source_type`, `source_concept_id`, `display_order`, `prompt_snapshot_md`, `answer_snapshot_md`)
SELECT `id`, `review_id`, `question_prompt_id`, `source_type`, `source_concept_id`, `display_order`, `prompt_snapshot_md`, `answer_snapshot_md`
FROM `review_questions`;
DROP TABLE `review_questions`;
ALTER TABLE `review_questions_new` RENAME TO `review_questions`;
CREATE UNIQUE INDEX `review_questions_review_order_unique` ON `review_questions` (`review_id`, `display_order`);
CREATE UNIQUE INDEX `review_questions_review_prompt_unique` ON `review_questions` (`review_id`, `question_prompt_id`);
CREATE INDEX `review_questions_prompt_idx` ON `review_questions` (`question_prompt_id`);
PRAGMA foreign_keys=ON;
