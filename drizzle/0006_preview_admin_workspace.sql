CREATE TABLE `preview_sessions` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `status` text DEFAULT 'active' NOT NULL,
  `expires_at` integer NOT NULL,
  `last_error` text,
  `created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  `updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
  CONSTRAINT `preview_sessions_status_check` CHECK (`status` in ('active', 'cleanup_required', 'cleaned'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `preview_sessions_one_live_user_unique`
  ON `preview_sessions` (`user_id`)
  WHERE `status` in ('active', 'cleanup_required');
--> statement-breakpoint
CREATE INDEX `preview_sessions_expiry_idx` ON `preview_sessions` (`expires_at`, `status`);
--> statement-breakpoint
ALTER TABLE `cases` ADD `preview_session_id` text REFERENCES `preview_sessions`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `cases_preview_session_idx` ON `cases` (`preview_session_id`);
--> statement-breakpoint
ALTER TABLE `question_prompts` ADD `preview_session_id` text REFERENCES `preview_sessions`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `question_prompts_preview_session_idx` ON `question_prompts` (`preview_session_id`);
--> statement-breakpoint
ALTER TABLE `assets` ADD `preview_session_id` text REFERENCES `preview_sessions`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `assets_preview_session_idx` ON `assets` (`preview_session_id`);
--> statement-breakpoint
CREATE TRIGGER `reviews_reject_preview_case_insert`
BEFORE INSERT ON `reviews`
WHEN EXISTS (
  SELECT 1 FROM `cases`
  WHERE `cases`.`id` = NEW.`case_id`
    AND `cases`.`preview_session_id` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'Preview Cases cannot be used for learner Reviews');
END;
--> statement-breakpoint
CREATE TRIGGER `concept_questions_reject_preview_prompt_insert`
BEFORE INSERT ON `concept_questions`
WHEN EXISTS (
  SELECT 1 FROM `question_prompts`
  WHERE `question_prompts`.`id` = NEW.`question_prompt_id`
    AND `question_prompts`.`preview_session_id` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'Preview Question Prompts cannot be shared as Topic questions');
END;
--> statement-breakpoint
CREATE TRIGGER `concept_questions_reject_preview_prompt_update`
BEFORE UPDATE OF `question_prompt_id` ON `concept_questions`
WHEN EXISTS (
  SELECT 1 FROM `question_prompts`
  WHERE `question_prompts`.`id` = NEW.`question_prompt_id`
    AND `question_prompts`.`preview_session_id` IS NOT NULL
)
BEGIN
  SELECT RAISE(ABORT, 'Preview Question Prompts cannot be shared as Topic questions');
END;
--> statement-breakpoint
CREATE TRIGGER `case_assets_preview_ownership_insert`
BEFORE INSERT ON `case_assets`
WHEN (
  SELECT `preview_session_id` FROM `assets` WHERE `id` = NEW.`asset_id`
) IS NOT NULL
AND COALESCE((
  SELECT `preview_session_id` FROM `cases` WHERE `id` = NEW.`case_id`
), '') <> COALESCE((
  SELECT `preview_session_id` FROM `assets` WHERE `id` = NEW.`asset_id`
), '')
BEGIN
  SELECT RAISE(ABORT, 'Preview Assets may only be attached inside their owning Preview Session');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_options_preview_ownership_insert`
BEFORE INSERT ON `stimulus_group_options`
WHEN (
  SELECT `preview_session_id` FROM `assets` WHERE `id` = NEW.`asset_id`
) IS NOT NULL
AND COALESCE((
  SELECT c.`preview_session_id`
  FROM `stimulus_groups` g
  JOIN `cases` c ON c.`id` = g.`case_id`
  WHERE g.`id` = NEW.`stimulus_group_id`
), '') <> COALESCE((
  SELECT `preview_session_id` FROM `assets` WHERE `id` = NEW.`asset_id`
), '')
BEGIN
  SELECT RAISE(ABORT, 'Preview Assets may only be used inside their owning Preview Session');
END;
--> statement-breakpoint
CREATE TRIGGER `case_questions_preview_prompt_ownership_insert`
BEFORE INSERT ON `case_questions`
WHEN COALESCE((SELECT `preview_session_id` FROM `cases` WHERE `id` = NEW.`case_id`), '')
  <> COALESCE((SELECT `preview_session_id` FROM `question_prompts` WHERE `id` = NEW.`question_prompt_id`), '')
BEGIN
  SELECT RAISE(ABORT, 'Case Question Prompt ownership must match Case Preview ownership');
END;
--> statement-breakpoint
CREATE TRIGGER `case_questions_preview_prompt_ownership_update`
BEFORE UPDATE OF `case_id`, `question_prompt_id` ON `case_questions`
WHEN COALESCE((SELECT `preview_session_id` FROM `cases` WHERE `id` = NEW.`case_id`), '')
  <> COALESCE((SELECT `preview_session_id` FROM `question_prompts` WHERE `id` = NEW.`question_prompt_id`), '')
BEGIN
  SELECT RAISE(ABORT, 'Case Question Prompt ownership must match Case Preview ownership');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_group_questions_preview_prompt_ownership_insert`
BEFORE INSERT ON `stimulus_group_questions`
WHEN COALESCE((
  SELECT c.`preview_session_id`
  FROM `stimulus_groups` g JOIN `cases` c ON c.`id` = g.`case_id`
  WHERE g.`id` = NEW.`stimulus_group_id`
), '') <> COALESCE((
  SELECT `preview_session_id` FROM `question_prompts` WHERE `id` = NEW.`question_prompt_id`
), '')
BEGIN
  SELECT RAISE(ABORT, 'Stimulus Group Question Prompt ownership must match Case Preview ownership');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_option_questions_preview_prompt_ownership_insert`
BEFORE INSERT ON `stimulus_option_questions`
WHEN COALESCE((
  SELECT c.`preview_session_id`
  FROM `stimulus_group_options` o
  JOIN `stimulus_groups` g ON g.`id` = o.`stimulus_group_id`
  JOIN `cases` c ON c.`id` = g.`case_id`
  WHERE o.`id` = NEW.`stimulus_group_option_id`
), '') <> COALESCE((
  SELECT `preview_session_id` FROM `question_prompts` WHERE `id` = NEW.`question_prompt_id`
), '')
BEGIN
  SELECT RAISE(ABORT, 'Stimulus Option Question Prompt ownership must match Case Preview ownership');
END;
--> statement-breakpoint
CREATE TRIGGER `cases_preview_ownership_immutable`
BEFORE UPDATE OF `preview_session_id` ON `cases`
WHEN OLD.`preview_session_id` IS NOT NEW.`preview_session_id`
BEGIN
  SELECT RAISE(ABORT, 'Case Preview ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `question_prompts_preview_ownership_immutable`
BEFORE UPDATE OF `preview_session_id` ON `question_prompts`
WHEN OLD.`preview_session_id` IS NOT NEW.`preview_session_id`
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt Preview ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_preview_ownership_immutable`
BEFORE UPDATE OF `preview_session_id` ON `assets`
WHEN OLD.`preview_session_id` IS NOT NEW.`preview_session_id`
BEGIN
  SELECT RAISE(ABORT, 'Asset Preview ownership is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `case_assets_preview_ownership_update`
BEFORE UPDATE OF `case_id`, `asset_id` ON `case_assets`
WHEN (
  SELECT `preview_session_id` FROM `assets` WHERE `id` = NEW.`asset_id`
) IS NOT NULL
AND COALESCE((
  SELECT `preview_session_id` FROM `cases` WHERE `id` = NEW.`case_id`
), '') <> COALESCE((
  SELECT `preview_session_id` FROM `assets` WHERE `id` = NEW.`asset_id`
), '')
BEGIN
  SELECT RAISE(ABORT, 'Preview Assets may only be attached inside their owning Preview Session');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_options_preview_ownership_update`
BEFORE UPDATE OF `stimulus_group_id`, `asset_id` ON `stimulus_group_options`
WHEN (
  SELECT `preview_session_id` FROM `assets` WHERE `id` = NEW.`asset_id`
) IS NOT NULL
AND COALESCE((
  SELECT c.`preview_session_id`
  FROM `stimulus_groups` g
  JOIN `cases` c ON c.`id` = g.`case_id`
  WHERE g.`id` = NEW.`stimulus_group_id`
), '') <> COALESCE((
  SELECT `preview_session_id` FROM `assets` WHERE `id` = NEW.`asset_id`
), '')
BEGIN
  SELECT RAISE(ABORT, 'Preview Assets may only be used inside their owning Preview Session');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_group_questions_preview_prompt_ownership_update`
BEFORE UPDATE OF `stimulus_group_id`, `question_prompt_id` ON `stimulus_group_questions`
WHEN COALESCE((
  SELECT c.`preview_session_id`
  FROM `stimulus_groups` g JOIN `cases` c ON c.`id` = g.`case_id`
  WHERE g.`id` = NEW.`stimulus_group_id`
), '') <> COALESCE((
  SELECT `preview_session_id` FROM `question_prompts` WHERE `id` = NEW.`question_prompt_id`
), '')
BEGIN
  SELECT RAISE(ABORT, 'Stimulus Group Question Prompt ownership must match Case Preview ownership');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_option_questions_preview_prompt_ownership_update`
BEFORE UPDATE OF `stimulus_group_option_id`, `question_prompt_id` ON `stimulus_option_questions`
WHEN COALESCE((
  SELECT c.`preview_session_id`
  FROM `stimulus_group_options` o
  JOIN `stimulus_groups` g ON g.`id` = o.`stimulus_group_id`
  JOIN `cases` c ON c.`id` = g.`case_id`
  WHERE o.`id` = NEW.`stimulus_group_option_id`
), '') <> COALESCE((
  SELECT `preview_session_id` FROM `question_prompts` WHERE `id` = NEW.`question_prompt_id`
), '')
BEGIN
  SELECT RAISE(ABORT, 'Stimulus Option Question Prompt ownership must match Case Preview ownership');
END;
