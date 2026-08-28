ALTER TABLE stimulus_groups ADD COLUMN original_option_id text;

CREATE INDEX IF NOT EXISTS stimulus_groups_original_option_idx
  ON stimulus_groups(original_option_id);

-- A one-option active stimulus family is unambiguous at migration time: that
-- option is the canonical Original. Multi-option legacy families are
-- intentionally left unassigned so an Admin can curate them without guessing
-- from order/name.
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

-- An active production family with an explicit Original must remain valid not
-- only when the pointer changes, but also when an inactive family is
-- reactivated (or moved into production ownership). Legacy ambiguous families
-- may still keep original_option_id NULL until an Admin curates them.
CREATE TRIGGER stimulus_groups_active_production_original_guard
BEFORE UPDATE OF original_option_id, is_active, case_id ON stimulus_groups
WHEN NEW.is_active = 1
  AND NEW.original_option_id IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM cases
    WHERE cases.id = NEW.case_id
      AND cases.preview_session_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM stimulus_group_options
    INNER JOIN assets ON assets.id = stimulus_group_options.asset_id
    WHERE stimulus_group_options.id = NEW.original_option_id
      AND stimulus_group_options.stimulus_group_id = NEW.id
      AND stimulus_group_options.is_active = 1
      AND stimulus_group_options.removed_from_case = 0
      AND assets.is_active = 1
      AND assets.type = 'image'
      AND assets.preview_session_id IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'Active production stimulus families require an eligible Original stimulus.');
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

-- Repointing the Asset behind an active production Original is legitimate only
-- when the destination Asset is already an eligible production image. This is
-- what allows atomic higher-resolution replacement to repoint the stable option
-- row first and deactivate the superseded Asset afterwards.
CREATE TRIGGER stimulus_group_options_original_asset_update_guard
BEFORE UPDATE OF asset_id ON stimulus_group_options
WHEN NEW.asset_id <> OLD.asset_id
  AND EXISTS (
    SELECT 1
    FROM stimulus_groups
    INNER JOIN cases ON cases.id = stimulus_groups.case_id
    WHERE stimulus_groups.id = OLD.stimulus_group_id
      AND stimulus_groups.original_option_id = OLD.id
      AND stimulus_groups.is_active = 1
      AND cases.preview_session_id IS NULL
  )
  AND NOT EXISTS (
    SELECT 1
    FROM assets
    WHERE assets.id = NEW.asset_id
      AND assets.is_active = 1
      AND assets.type = 'image'
      AND assets.preview_session_id IS NULL
  )
BEGIN
  SELECT RAISE(ABORT, 'The Original stimulus must point to an active eligible production image.');
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

-- Do not auto-designate an Original on generic option insert/update. Insert
-- order is not source semantics: a multi-option family may be created
-- sequentially, and choosing the first inserted option would silently guess.
-- New authoring/import workflows must designate an Original explicitly, or
-- only after they can prove source ambiguity is absent.
