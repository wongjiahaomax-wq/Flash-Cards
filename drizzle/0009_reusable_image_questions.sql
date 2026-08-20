-- Canonical reusable knowledge attached to an exact production Asset.
CREATE TABLE `asset_questions` (
  `id` text PRIMARY KEY NOT NULL,
  `asset_id` text NOT NULL,
  `question_prompt_id` text NOT NULL,
  `answer_md` text NOT NULL,
  `is_active` integer NOT NULL DEFAULT true,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `asset_questions_asset_prompt_unique`
  ON `asset_questions` (`asset_id`, `question_prompt_id`);
--> statement-breakpoint
CREATE INDEX `asset_questions_prompt_idx`
  ON `asset_questions` (`question_prompt_id`);
--> statement-breakpoint
CREATE INDEX `asset_questions_asset_active_idx`
  ON `asset_questions` (`asset_id`, `is_active`);
--> statement-breakpoint
-- Asset Questions are production-curated global teaching content. Preview-owned
-- Assets and Prompts must never become their backing rows.
CREATE TRIGGER `asset_questions_reject_preview_content_insert`
BEFORE INSERT ON `asset_questions`
WHEN EXISTS (
  SELECT 1 FROM `assets`
  WHERE `assets`.`id` = NEW.`asset_id`
    AND `assets`.`preview_session_id` IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM `question_prompts`
  WHERE `question_prompts`.`id` = NEW.`question_prompt_id`
    AND `question_prompts`.`preview_session_id` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'Preview content cannot back reusable Asset Questions');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_questions_reject_preview_content_update`
BEFORE UPDATE OF `asset_id`, `question_prompt_id` ON `asset_questions`
WHEN EXISTS (
  SELECT 1 FROM `assets`
  WHERE `assets`.`id` = NEW.`asset_id`
    AND `assets`.`preview_session_id` IS NOT NULL
) OR EXISTS (
  SELECT 1 FROM `question_prompts`
  WHERE `question_prompts`.`id` = NEW.`question_prompt_id`
    AND `question_prompts`.`preview_session_id` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'Preview content cannot back reusable Asset Questions');
END;
--> statement-breakpoint
CREATE TABLE `stimulus_option_asset_questions` (
  `stimulus_group_option_id` text NOT NULL,
  `asset_question_id` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (`stimulus_group_option_id`, `asset_question_id`),
  FOREIGN KEY (`stimulus_group_option_id`) REFERENCES `stimulus_group_options`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`asset_question_id`) REFERENCES `asset_questions`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `stimulus_option_asset_questions_question_idx`
  ON `stimulus_option_asset_questions` (`asset_question_id`);
--> statement-breakpoint
-- Keep Asset identity consistent even if a caller bypasses application validation.
CREATE TRIGGER `stimulus_option_asset_questions_asset_match_insert`
BEFORE INSERT ON `stimulus_option_asset_questions`
WHEN NOT EXISTS (
  SELECT 1
  FROM `stimulus_group_options` AS `sgo`
  INNER JOIN `asset_questions` AS `aq` ON `aq`.`id` = NEW.`asset_question_id`
  WHERE `sgo`.`id` = NEW.`stimulus_group_option_id`
    AND `sgo`.`asset_id` = `aq`.`asset_id`
)
BEGIN
  SELECT RAISE(ABORT, 'Reusable Asset Question must match the stimulus option Asset');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_option_asset_questions_asset_match_update`
BEFORE UPDATE OF `stimulus_group_option_id`, `asset_question_id` ON `stimulus_option_asset_questions`
WHEN NOT EXISTS (
  SELECT 1
  FROM `stimulus_group_options` AS `sgo`
  INNER JOIN `asset_questions` AS `aq` ON `aq`.`id` = NEW.`asset_question_id`
  WHERE `sgo`.`id` = NEW.`stimulus_group_option_id`
    AND `sgo`.`asset_id` = `aq`.`asset_id`
)
BEGIN
  SELECT RAISE(ABORT, 'Reusable Asset Question must match the stimulus option Asset');
END;
--> statement-breakpoint
-- Reusable-image opt-ins participate in the existing cross-group Prompt invariant.
-- These triggers provide defense in depth for callers that bypass application helpers.
CREATE TRIGGER `stimulus_option_asset_questions_cross_group_insert`
BEFORE INSERT ON `stimulus_option_asset_questions`
WHEN EXISTS (
  SELECT 1
  FROM `asset_questions` aq
  JOIN `stimulus_group_options` target_option ON target_option.id = NEW.stimulus_group_option_id
  JOIN `stimulus_groups` target_group ON target_group.id = target_option.stimulus_group_id
  WHERE aq.id = NEW.asset_question_id
    AND (
      EXISTS (
        SELECT 1 FROM `stimulus_group_questions` sgq
        JOIN `stimulus_groups` other_group ON other_group.id = sgq.stimulus_group_id
        WHERE other_group.case_id = target_group.case_id
          AND other_group.id <> target_group.id
          AND other_group.is_active = true
          AND sgq.is_active = true
          AND sgq.question_prompt_id = aq.question_prompt_id
      )
      OR EXISTS (
        SELECT 1 FROM `stimulus_option_questions` soq
        JOIN `stimulus_group_options` other_option ON other_option.id = soq.stimulus_group_option_id
        JOIN `stimulus_groups` other_group ON other_group.id = other_option.stimulus_group_id
        WHERE other_group.case_id = target_group.case_id
          AND other_group.id <> target_group.id
          AND other_group.is_active = true
          AND other_option.is_active = true
          AND soq.is_active = true
          AND soq.question_prompt_id = aq.question_prompt_id
      )
      OR EXISTS (
        SELECT 1 FROM `stimulus_option_asset_questions` other_usage
        JOIN `asset_questions` other_aq ON other_aq.id = other_usage.asset_question_id
        JOIN `stimulus_group_options` other_option ON other_option.id = other_usage.stimulus_group_option_id
        JOIN `stimulus_groups` other_group ON other_group.id = other_option.stimulus_group_id
        WHERE other_group.case_id = target_group.case_id
          AND other_group.id <> target_group.id
          AND other_group.is_active = true
          AND other_option.is_active = true
          AND other_aq.is_active = true
          AND other_aq.question_prompt_id = aq.question_prompt_id
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_group_questions_reject_reusable_cross_group_insert`
BEFORE INSERT ON `stimulus_group_questions`
WHEN NEW.is_active = true AND EXISTS (
  SELECT 1
  FROM `stimulus_groups` target_group
  JOIN `stimulus_groups` other_group ON other_group.case_id = target_group.case_id AND other_group.id <> target_group.id
  JOIN `stimulus_group_options` other_option ON other_option.stimulus_group_id = other_group.id
  JOIN `stimulus_option_asset_questions` usage ON usage.stimulus_group_option_id = other_option.id
  JOIN `asset_questions` aq ON aq.id = usage.asset_question_id
  WHERE target_group.id = NEW.stimulus_group_id
    AND other_group.is_active = true
    AND other_option.is_active = true
    AND aq.is_active = true
    AND aq.question_prompt_id = NEW.question_prompt_id
)
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_group_questions_reject_reusable_cross_group_update`
BEFORE UPDATE OF `stimulus_group_id`, `question_prompt_id`, `is_active` ON `stimulus_group_questions`
WHEN NEW.is_active = true AND EXISTS (
  SELECT 1
  FROM `stimulus_groups` target_group
  JOIN `stimulus_groups` other_group ON other_group.case_id = target_group.case_id AND other_group.id <> target_group.id
  JOIN `stimulus_group_options` other_option ON other_option.stimulus_group_id = other_group.id
  JOIN `stimulus_option_asset_questions` usage ON usage.stimulus_group_option_id = other_option.id
  JOIN `asset_questions` aq ON aq.id = usage.asset_question_id
  WHERE target_group.id = NEW.stimulus_group_id
    AND other_group.is_active = true
    AND other_option.is_active = true
    AND aq.is_active = true
    AND aq.question_prompt_id = NEW.question_prompt_id
)
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_option_questions_reject_reusable_cross_group_insert`
BEFORE INSERT ON `stimulus_option_questions`
WHEN NEW.is_active = true AND EXISTS (
  SELECT 1
  FROM `stimulus_group_options` target_option
  JOIN `stimulus_groups` target_group ON target_group.id = target_option.stimulus_group_id
  JOIN `stimulus_groups` other_group ON other_group.case_id = target_group.case_id AND other_group.id <> target_group.id
  JOIN `stimulus_group_options` other_option ON other_option.stimulus_group_id = other_group.id
  JOIN `stimulus_option_asset_questions` usage ON usage.stimulus_group_option_id = other_option.id
  JOIN `asset_questions` aq ON aq.id = usage.asset_question_id
  WHERE target_option.id = NEW.stimulus_group_option_id
    AND other_group.is_active = true
    AND other_option.is_active = true
    AND aq.is_active = true
    AND aq.question_prompt_id = NEW.question_prompt_id
)
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_option_questions_reject_reusable_cross_group_update`
BEFORE UPDATE OF `stimulus_group_option_id`, `question_prompt_id`, `is_active` ON `stimulus_option_questions`
WHEN NEW.is_active = true AND EXISTS (
  SELECT 1
  FROM `stimulus_group_options` target_option
  JOIN `stimulus_groups` target_group ON target_group.id = target_option.stimulus_group_id
  JOIN `stimulus_groups` other_group ON other_group.case_id = target_group.case_id AND other_group.id <> target_group.id
  JOIN `stimulus_group_options` other_option ON other_option.stimulus_group_id = other_group.id
  JOIN `stimulus_option_asset_questions` usage ON usage.stimulus_group_option_id = other_option.id
  JOIN `asset_questions` aq ON aq.id = usage.asset_question_id
  WHERE target_option.id = NEW.stimulus_group_option_id
    AND other_group.is_active = true
    AND other_option.is_active = true
    AND aq.is_active = true
    AND aq.question_prompt_id = NEW.question_prompt_id
)
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
--> statement-breakpoint
-- SQLite/D1 cannot alter the source_type CHECK in place. Rebuild while preserving
-- every existing Review snapshot and add nullable Asset Question provenance.
CREATE TABLE `review_questions_new` (
  `id` text PRIMARY KEY NOT NULL,
  `review_id` text NOT NULL,
  `question_prompt_id` text NOT NULL,
  `source_type` text NOT NULL,
  `source_concept_id` text,
  `source_stimulus_group_id` text,
  `source_stimulus_option_id` text,
  `source_asset_question_id` text,
  `source_shared_question_id` text,
  `display_order` integer NOT NULL,
  `prompt_snapshot_md` text NOT NULL,
  `answer_snapshot_md` text NOT NULL,
  FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_stimulus_group_id`) REFERENCES `stimulus_groups`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_stimulus_option_id`) REFERENCES `stimulus_group_options`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_asset_question_id`) REFERENCES `asset_questions`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`source_shared_question_id`) REFERENCES `shared_questions`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `review_questions_source_type_check`
    CHECK (`source_type` in ('case', 'concept', 'ancestor_concept', 'stimulus_group', 'asset', 'stimulus_option', 'tag_shared')),
  CONSTRAINT `review_questions_display_order_nonnegative` CHECK (`display_order` >= 0)
);
--> statement-breakpoint
INSERT INTO `review_questions_new` (
  `id`, `review_id`, `question_prompt_id`, `source_type`, `source_concept_id`,
  `source_stimulus_group_id`, `source_stimulus_option_id`, `source_asset_question_id`,
  `source_shared_question_id`, `display_order`, `prompt_snapshot_md`, `answer_snapshot_md`
)
SELECT
  `id`, `review_id`, `question_prompt_id`, `source_type`, `source_concept_id`,
  `source_stimulus_group_id`, `source_stimulus_option_id`, NULL,
  `source_shared_question_id`, `display_order`, `prompt_snapshot_md`, `answer_snapshot_md`
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
CREATE INDEX `review_questions_asset_question_idx`
  ON `review_questions` (`source_asset_question_id`);
--> statement-breakpoint
CREATE INDEX `review_questions_shared_question_idx`
  ON `review_questions` (`source_shared_question_id`);
