-- Tagging Stage B schema foundation only. Learner eligibility/resolution and Admin authoring land separately.
CREATE TABLE `shared_questions` (
  `id` text PRIMARY KEY NOT NULL,
  `question_prompt_id` text NOT NULL,
  `answer_md` text NOT NULL,
  `reuse_scope_tag_id` text NOT NULL,
  `is_active` integer NOT NULL DEFAULT true,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`reuse_scope_tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `shared_questions_prompt_idx` ON `shared_questions` (`question_prompt_id`);
--> statement-breakpoint
CREATE INDEX `shared_questions_scope_active_idx` ON `shared_questions` (`reuse_scope_tag_id`, `is_active`);
--> statement-breakpoint
CREATE INDEX `shared_questions_active_idx` ON `shared_questions` (`is_active`);
--> statement-breakpoint
CREATE UNIQUE INDEX `shared_questions_active_prompt_unique`
  ON `shared_questions` (`question_prompt_id`)
  WHERE `is_active` = true;
--> statement-breakpoint
CREATE TABLE `shared_question_tags` (
  `shared_question_id` text NOT NULL,
  `tag_id` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (`shared_question_id`, `tag_id`),
  FOREIGN KEY (`shared_question_id`) REFERENCES `shared_questions`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `shared_question_tags_tag_question_idx`
  ON `shared_question_tags` (`tag_id`, `shared_question_id`);
--> statement-breakpoint
-- SQLite/D1 cannot alter the existing source_type CHECK constraint in place.
-- Rebuild review_questions conservatively, copying every existing semantic field unchanged.
CREATE TABLE `review_questions_new` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL,
  `question_prompt_id` text NOT NULL,
  `source_type` text NOT NULL,
  `source_concept_id` text,
  `source_stimulus_group_id` text,
  `source_stimulus_option_id` text,
  `source_shared_question_id` text,
  `display_order` integer NOT NULL,
  `prompt_snapshot_md` text NOT NULL,
  `answer_snapshot_md` text NOT NULL,
  FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_stimulus_group_id`) REFERENCES `stimulus_groups`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_stimulus_option_id`) REFERENCES `stimulus_group_options`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_shared_question_id`) REFERENCES `shared_questions`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `review_questions_source_type_check`
    CHECK (`source_type` in ('case', 'concept', 'ancestor_concept', 'stimulus_group', 'stimulus_option', 'tag_shared')),
  CONSTRAINT `review_questions_display_order_nonnegative` CHECK (`display_order` >= 0)
);
--> statement-breakpoint
INSERT INTO `review_questions_new` (
  `id`,
  `review_id`,
  `question_prompt_id`,
  `source_type`,
  `source_concept_id`,
  `source_stimulus_group_id`,
  `source_stimulus_option_id`,
  `source_shared_question_id`,
  `display_order`,
  `prompt_snapshot_md`,
  `answer_snapshot_md`
)
SELECT
  `id`,
  `review_id`,
  `question_prompt_id`,
  `source_type`,
  `source_concept_id`,
  `source_stimulus_group_id`,
  `source_stimulus_option_id`,
  NULL,
  `display_order`,
  `prompt_snapshot_md`,
  `answer_snapshot_md`
FROM `review_questions`;
--> statement-breakpoint
DROP TABLE `review_questions`;
--> statement-breakpoint
ALTER TABLE `review_questions_new` RENAME TO `review_questions`;
--> statement-breakpoint
CREATE UNIQUE INDEX `review_questions_review_order_unique`
  ON `review_questions` (`review_id`, `display_order`);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_questions_review_prompt_unique`
  ON `review_questions` (`review_id`, `question_prompt_id`);
--> statement-breakpoint
CREATE INDEX `review_questions_prompt_idx`
  ON `review_questions` (`question_prompt_id`);
--> statement-breakpoint
CREATE INDEX `review_questions_shared_question_idx`
  ON `review_questions` (`source_shared_question_id`);
