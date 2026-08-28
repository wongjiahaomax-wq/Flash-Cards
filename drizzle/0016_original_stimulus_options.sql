ALTER TABLE stimulus_groups ADD COLUMN original_option_id text;

CREATE INDEX IF NOT EXISTS stimulus_groups_original_option_idx
  ON stimulus_groups(original_option_id);

-- A one-option active stimulus family is unambiguous: that option is the
-- canonical Original. Multi-option legacy families are intentionally left
-- unassigned so an Admin can curate them without guessing from order/name.
UPDATE stimulus_groups
SET original_option_id = (
  SELECT stimulus_group_options.id
  FROM stimulus_group_options
  INNER JOIN assets ON assets.id = stimulus_group_options.asset_id
  WHERE stimulus_group_options.stimulus_group_id = stimulus_groups.id
    AND stimulus_group_options.is_active = 1
    AND stimulus_group_options.removed_from_case = 0
    AND assets.is_active = 1
  LIMIT 1
)
WHERE stimulus_groups.original_option_id IS NULL
  AND stimulus_groups.is_active = 1
  AND (
    SELECT COUNT(*)
    FROM stimulus_group_options
    INNER JOIN assets ON assets.id = stimulus_group_options.asset_id
    WHERE stimulus_group_options.stimulus_group_id = stimulus_groups.id
      AND stimulus_group_options.is_active = 1
      AND stimulus_group_options.removed_from_case = 0
      AND assets.is_active = 1
  ) = 1;
