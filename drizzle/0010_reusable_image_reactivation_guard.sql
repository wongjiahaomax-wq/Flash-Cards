-- Reactivating a dormant reusable image question must not resurrect an invalid
-- cross-Stimulus-Group Prompt configuration after other relationships changed.
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
            AND other_aq.is_active = true
            AND other_aq.question_prompt_id = NEW.question_prompt_id
        )
      )
  )
BEGIN
  SELECT RAISE(ABORT, 'Question Prompt cannot be stimulus-specific in multiple independently selectable groups');
END;
