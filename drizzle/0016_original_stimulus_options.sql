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

-- Keep the group pointer valid. The application provides the friendly
-- validation message; these triggers are the final atomic integrity guard.
CREATE TRIGGER stimulus_groups_original_option_update_guard
BEFORE UPDATE OF original_option_id ON stimulus_groups
WHEN NEW.original_option_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM stimulus_group_options
    INNER JOIN assets ON assets.id = stimulus_group_options.asset_id
    WHERE stimulus_group_options.id = NEW.original_option_id
      AND stimulus_group_options.stimulus_group_id = NEW.id
      AND stimulus_group_options.is_active = 1
      AND stimulus_group_options.removed_from_case = 0
      AND assets.is_active = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Original stimulus must be an active eligible option in this family.');
END;

CREATE TRIGGER stimulus_group_options_original_update_guard
BEFORE UPDATE OF stimulus_group_id, is_active, removed_from_case ON stimulus_group_options
WHEN OLD.id = (
    SELECT original_option_id
    FROM stimulus_groups
    WHERE id = OLD.stimulus_group_id
  )
  AND (
    NEW.stimulus_group_id <> OLD.stimulus_group_id
    OR NEW.is_active = 0
    OR NEW.removed_from_case = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Choose another Original stimulus before removing, deactivating, or moving this option.');
END;

CREATE TRIGGER stimulus_group_options_original_delete_guard
BEFORE DELETE ON stimulus_group_options
WHEN OLD.id = (
  SELECT original_option_id
  FROM stimulus_groups
  WHERE id = OLD.stimulus_group_id
)
BEGIN
  SELECT RAISE(ABORT, 'Choose another Original stimulus before deleting this option.');
END;

CREATE TRIGGER assets_original_stimulus_deactivate_guard
BEFORE UPDATE OF is_active ON assets
WHEN OLD.is_active = 1
  AND NEW.is_active = 0
  AND EXISTS (
    SELECT 1
    FROM stimulus_group_options
    INNER JOIN stimulus_groups ON stimulus_groups.original_option_id = stimulus_group_options.id
    WHERE stimulus_group_options.asset_id = OLD.id
      AND stimulus_group_options.stimulus_group_id = stimulus_groups.id
      AND stimulus_groups.is_active = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Choose another Original stimulus before deactivating this image.');
END;

-- Newly authored one-option families are also unambiguous. Once a second
-- option exists, the existing Original remains stable rather than changing by
-- order. Bulk-created multi-option families stay unassigned for explicit
-- curation.
CREATE TRIGGER stimulus_group_options_assign_single_original_after_insert
AFTER INSERT ON stimulus_group_options
WHEN NEW.is_active = 1
  AND NEW.removed_from_case = 0
  AND EXISTS (SELECT 1 FROM assets WHERE id = NEW.asset_id AND is_active = 1)
  AND (SELECT original_option_id FROM stimulus_groups WHERE id = NEW.stimulus_group_id) IS NULL
  AND (
    SELECT COUNT(*)
    FROM stimulus_group_options
    INNER JOIN assets ON assets.id = stimulus_group_options.asset_id
    WHERE stimulus_group_options.stimulus_group_id = NEW.stimulus_group_id
      AND stimulus_group_options.is_active = 1
      AND stimulus_group_options.removed_from_case = 0
      AND assets.is_active = 1
  ) = 1
BEGIN
  UPDATE stimulus_groups
  SET original_option_id = NEW.id,
      updated_at = unixepoch() * 1000
  WHERE id = NEW.stimulus_group_id
    AND original_option_id IS NULL;
END;

CREATE TRIGGER stimulus_group_options_assign_single_original_after_update
AFTER UPDATE OF stimulus_group_id, is_active, removed_from_case ON stimulus_group_options
WHEN NEW.is_active = 1
  AND NEW.removed_from_case = 0
  AND EXISTS (SELECT 1 FROM assets WHERE id = NEW.asset_id AND is_active = 1)
  AND (SELECT original_option_id FROM stimulus_groups WHERE id = NEW.stimulus_group_id) IS NULL
  AND (
    SELECT COUNT(*)
    FROM stimulus_group_options
    INNER JOIN assets ON assets.id = stimulus_group_options.asset_id
    WHERE stimulus_group_options.stimulus_group_id = NEW.stimulus_group_id
      AND stimulus_group_options.is_active = 1
      AND stimulus_group_options.removed_from_case = 0
      AND assets.is_active = 1
  ) = 1
BEGIN
  UPDATE stimulus_groups
  SET original_option_id = NEW.id,
      updated_at = unixepoch() * 1000
  WHERE id = NEW.stimulus_group_id
    AND original_option_id IS NULL;
END;
