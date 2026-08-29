-- Align the reusable-question defense-in-depth triggers with the reviewed live
-- Stimulus Family policy. Historical migrations 0009/0010 remain immutable;
-- deployed databases replace those trigger definitions through this migration.
--
-- Dormant Families, inactive Options and removed Options retain authored
-- relationships but do not reserve live Prompt ownership. The application
-- revalidates the full graph before any such relationship becomes selectable.

DROP TRIGGER IF EXISTS `stimulus_option_asset_questions_cross_group_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `stimulus_group_questions_reject_reusable_cross_group_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `stimulus_group_questions_reject_reusable_cross_group_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `stimulus_option_questions_reject_reusable_cross_group_insert`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `stimulus_option_questions_reject_reusable_cross_group_update`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `asset_questions_reactivation_cross_group_guard`;
--> statement-breakpoint

-- A reusable opt-in participates in the cross-Family invariant only when the
-- reusable Question and its target Family/Option are all currently live.
CREATE TRIGGER `stimulus_option_asset_questions_cross_group_insert`
BEFORE INSERT ON `stimulus_option_asset_questions`
WHEN EXISTS (
  SELECT 1
  FROM `asset_questions` aq
  JOIN `stimulus_group_options` target_option ON target_option.id = NEW.stimulus_group_option_id
  JOIN `stimulus_groups` target_group ON target_group.id = target_option.stimulus_group_id
  WHERE aq.id = NEW.asset_question_id
    AND aq.is_active = true
    AND target_group.is_active = true
    AND target_option.is_active = true
    AND target_option.removed_from_case = false
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
          AND other_option.removed_from_case = false
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
          AND other_option.removed_from_case = false
          AND other_aq.is_active = true
          AND other_aq.question_prompt_id = aq.question_prompt_id
      )
    )
)
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
--> statement-breakpoint

-- Ordinary Family Questions are dormant while their target Family is inactive.
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
    AND target_group.is_active = true
    AND other_group.is_active = true
    AND other_option.is_active = true
    AND other_option.removed_from_case = false
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
    AND target_group.is_active = true
    AND other_group.is_active = true
    AND other_option.is_active = true
    AND other_option.removed_from_case = false
    AND aq.is_active = true
    AND aq.question_prompt_id = NEW.question_prompt_id
)
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
--> statement-breakpoint

-- Ordinary Option Questions are dormant unless both their target Family and
-- target Option are live and the Option has not been removed from the Case.
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
    AND target_group.is_active = true
    AND target_option.is_active = true
    AND target_option.removed_from_case = false
    AND other_group.is_active = true
    AND other_option.is_active = true
    AND other_option.removed_from_case = false
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
    AND target_group.is_active = true
    AND target_option.is_active = true
    AND target_option.removed_from_case = false
    AND other_group.is_active = true
    AND other_option.is_active = true
    AND other_option.removed_from_case = false
    AND aq.is_active = true
    AND aq.question_prompt_id = NEW.question_prompt_id
)
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
--> statement-breakpoint

-- Reusable Question reactivation only considers usages whose Family/Option are
-- live. Removed Options are history and cannot make the reactivated Prompt live.
CREATE TRIGGER `asset_questions_reactivation_cross_group_guard`
BEFORE UPDATE OF `is_active` ON `asset_questions`
WHEN OLD.`is_active` = false
  AND NEW.`is_active` = true
  AND EXISTS (
    SELECT 1
    FROM `stimulus_option_asset_questions` AS target_usage
    JOIN `stimulus_group_options` AS target_option
      ON target_option.id = target_usage.stimulus_group_option_id
    JOIN `stimulus_groups` AS target_group
      ON target_group.id = target_option.stimulus_group_id
    WHERE target_usage.asset_question_id = NEW.id
      AND target_group.is_active = true
      AND target_option.is_active = true
      AND target_option.removed_from_case = false
      AND (
        EXISTS (
          SELECT 1
          FROM `stimulus_option_asset_questions` AS same_question_usage
          JOIN `stimulus_group_options` AS other_option
            ON other_option.id = same_question_usage.stimulus_group_option_id
          JOIN `stimulus_groups` AS other_group
            ON other_group.id = other_option.stimulus_group_id
          WHERE same_question_usage.asset_question_id = NEW.id
            AND other_group.case_id = target_group.case_id
            AND other_group.id <> target_group.id
            AND other_group.is_active = true
            AND other_option.is_active = true
            AND other_option.removed_from_case = false
        )
        OR EXISTS (
          SELECT 1
          FROM `stimulus_group_questions` AS sgq
          JOIN `stimulus_groups` AS other_group
            ON other_group.id = sgq.stimulus_group_id
          WHERE other_group.case_id = target_group.case_id
            AND other_group.id <> target_group.id
            AND other_group.is_active = true
            AND sgq.is_active = true
            AND sgq.question_prompt_id = NEW.question_prompt_id
        )
        OR EXISTS (
          SELECT 1
          FROM `stimulus_option_questions` AS soq
          JOIN `stimulus_group_options` AS other_option
            ON other_option.id = soq.stimulus_group_option_id
          JOIN `stimulus_groups` AS other_group
            ON other_group.id = other_option.stimulus_group_id
          WHERE other_group.case_id = target_group.case_id
            AND other_group.id <> target_group.id
            AND other_group.is_active = true
            AND other_option.is_active = true
            AND other_option.removed_from_case = false
            AND soq.is_active = true
            AND soq.question_prompt_id = NEW.question_prompt_id
        )
        OR EXISTS (
          SELECT 1
          FROM `stimulus_option_asset_questions` AS other_usage
          JOIN `asset_questions` AS other_aq
            ON other_aq.id = other_usage.asset_question_id
          JOIN `stimulus_group_options` AS other_option
            ON other_option.id = other_usage.stimulus_group_option_id
          JOIN `stimulus_groups` AS other_group
            ON other_group.id = other_option.stimulus_group_id
          WHERE other_group.case_id = target_group.case_id
            AND other_group.id <> target_group.id
            AND other_group.is_active = true
            AND other_option.is_active = true
            AND other_option.removed_from_case = false
            AND other_aq.is_active = true
            AND other_aq.question_prompt_id = NEW.question_prompt_id
        )
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
