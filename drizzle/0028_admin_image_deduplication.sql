-- Durable Asset deduplication tombstones. A non-null value is a cleanup-pending
-- claim and is deliberately separate from higher-resolution supersession.
ALTER TABLE `assets` ADD `deduplicated_into_asset_id` text REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `assets_deduplicated_into_idx` ON `assets` (`deduplicated_into_asset_id`);
--> statement-breakpoint

CREATE TRIGGER `assets_dedupe_insert_requires_inactive`
BEFORE INSERT ON `assets`
WHEN NEW.`deduplicated_into_asset_id` IS NOT NULL AND NEW.`is_active` = true
BEGIN
	SELECT RAISE(ABORT, 'Deduplication tombstones must be inactive');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_dedupe_insert_rejects_self`
BEFORE INSERT ON `assets`
WHEN NEW.`deduplicated_into_asset_id` = NEW.`id`
BEGIN
	SELECT RAISE(ABORT, 'An Asset cannot be deduplicated into itself');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_dedupe_insert_rejects_tombstoned_target`
BEFORE INSERT ON `assets`
WHEN NEW.`deduplicated_into_asset_id` IS NOT NULL
  AND EXISTS (
	SELECT 1 FROM `assets` target
	WHERE target.`id` = NEW.`deduplicated_into_asset_id`
	  AND target.`deduplicated_into_asset_id` IS NOT NULL
  )
BEGIN
	SELECT RAISE(ABORT, 'A deduplication target must not already be tombstoned');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_dedupe_update_requires_inactive`
BEFORE UPDATE OF `deduplicated_into_asset_id` ON `assets`
WHEN OLD.`deduplicated_into_asset_id` IS NULL
  AND NEW.`deduplicated_into_asset_id` IS NOT NULL
  AND NEW.`is_active` = true
BEGIN
	SELECT RAISE(ABORT, 'Deduplication tombstones must be inactive');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_dedupe_update_rejects_self`
BEFORE UPDATE OF `deduplicated_into_asset_id` ON `assets`
WHEN OLD.`deduplicated_into_asset_id` IS NULL
  AND NEW.`deduplicated_into_asset_id` = NEW.`id`
BEGIN
	SELECT RAISE(ABORT, 'An Asset cannot be deduplicated into itself');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_dedupe_update_rejects_tombstoned_target`
BEFORE UPDATE OF `deduplicated_into_asset_id` ON `assets`
WHEN OLD.`deduplicated_into_asset_id` IS NULL
  AND NEW.`deduplicated_into_asset_id` IS NOT NULL
  AND EXISTS (
	SELECT 1 FROM `assets` target
	WHERE target.`id` = NEW.`deduplicated_into_asset_id`
	  AND target.`deduplicated_into_asset_id` IS NOT NULL
  )
BEGIN
	SELECT RAISE(ABORT, 'A deduplication target must not already be tombstoned');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_dedupe_update_rejects_incoming_source`
BEFORE UPDATE OF `deduplicated_into_asset_id` ON `assets`
WHEN OLD.`deduplicated_into_asset_id` IS NULL
  AND NEW.`deduplicated_into_asset_id` IS NOT NULL
  AND EXISTS (
	SELECT 1 FROM `assets` child
	WHERE child.`deduplicated_into_asset_id` = OLD.`id`
  )
BEGIN
	SELECT RAISE(ABORT, 'An Asset with an incoming deduplication tombstone cannot be a source');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_dedupe_immutable`
BEFORE UPDATE ON `assets`
WHEN OLD.`deduplicated_into_asset_id` IS NOT NULL
  AND NEW.`deduplicated_into_asset_id` IS NOT OLD.`deduplicated_into_asset_id`
BEGIN
	SELECT RAISE(ABORT, 'Deduplication tombstones are immutable');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_dedupe_reactivation_guard`
BEFORE UPDATE OF `is_active` ON `assets`
WHEN OLD.`deduplicated_into_asset_id` IS NOT NULL AND NEW.`is_active` = true
BEGIN
	SELECT RAISE(ABORT, 'A deduplicated Asset cannot be reactivated');
END;
--> statement-breakpoint

CREATE TRIGGER `case_assets_reject_deduplicated_asset_insert`
BEFORE INSERT ON `case_assets`
WHEN EXISTS (SELECT 1 FROM `assets` WHERE `id` = NEW.`asset_id` AND `deduplicated_into_asset_id` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'A deduplicated Asset cannot acquire a Case reference');
END;
--> statement-breakpoint
CREATE TRIGGER `case_assets_reject_deduplicated_asset_update`
BEFORE UPDATE OF `asset_id` ON `case_assets`
WHEN EXISTS (SELECT 1 FROM `assets` WHERE `id` = NEW.`asset_id` AND `deduplicated_into_asset_id` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'A deduplicated Asset cannot acquire a Case reference');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_group_options_reject_deduplicated_asset_insert`
BEFORE INSERT ON `stimulus_group_options`
WHEN EXISTS (SELECT 1 FROM `assets` WHERE `id` = NEW.`asset_id` AND `deduplicated_into_asset_id` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'A deduplicated Asset cannot acquire a Stimulus Option reference');
END;
--> statement-breakpoint
CREATE TRIGGER `stimulus_group_options_reject_deduplicated_asset_update`
BEFORE UPDATE OF `asset_id` ON `stimulus_group_options`
WHEN EXISTS (SELECT 1 FROM `assets` WHERE `id` = NEW.`asset_id` AND `deduplicated_into_asset_id` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'A deduplicated Asset cannot acquire a Stimulus Option reference');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_questions_reject_deduplicated_asset_insert`
BEFORE INSERT ON `asset_questions`
WHEN EXISTS (SELECT 1 FROM `assets` WHERE `id` = NEW.`asset_id` AND `deduplicated_into_asset_id` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'A deduplicated Asset cannot acquire an Asset Question reference');
END;
--> statement-breakpoint
CREATE TRIGGER `asset_questions_reject_deduplicated_asset_update`
BEFORE UPDATE OF `asset_id` ON `asset_questions`
WHEN EXISTS (SELECT 1 FROM `assets` WHERE `id` = NEW.`asset_id` AND `deduplicated_into_asset_id` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'A deduplicated Asset cannot acquire an Asset Question reference');
END;
--> statement-breakpoint
CREATE TRIGGER `active_review_assets_reject_deduplicated_asset_insert`
BEFORE INSERT ON `active_review_assets`
WHEN EXISTS (SELECT 1 FROM `assets` WHERE `id` = NEW.`asset_id` AND `deduplicated_into_asset_id` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'An active Review cannot acquire a deduplicated Asset');
END;
--> statement-breakpoint
CREATE TRIGGER `active_review_assets_reject_deduplicated_asset_update`
BEFORE UPDATE OF `asset_id` ON `active_review_assets`
WHEN EXISTS (SELECT 1 FROM `assets` WHERE `id` = NEW.`asset_id` AND `deduplicated_into_asset_id` IS NOT NULL)
BEGIN
	SELECT RAISE(ABORT, 'An active Review cannot acquire a deduplicated Asset');
END;
--> statement-breakpoint
CREATE TRIGGER `active_review_assets_reject_deduplicated_storage_key_insert`
BEFORE INSERT ON `active_review_assets`
WHEN EXISTS (
	SELECT 1 FROM `assets` tombstone
	WHERE tombstone.`deduplicated_into_asset_id` IS NOT NULL
	  AND tombstone.`storage_key` = NEW.`storage_key_snapshot`
	  AND tombstone.`id` <> NEW.`asset_id`
)
BEGIN
	SELECT RAISE(ABORT, 'An active Review cannot acquire a deduplicated Asset storage key');
END;
--> statement-breakpoint
CREATE TRIGGER `active_review_assets_reject_deduplicated_storage_key_update`
BEFORE UPDATE OF `asset_id`, `storage_key_snapshot` ON `active_review_assets`
WHEN EXISTS (
	SELECT 1 FROM `assets` tombstone
	WHERE tombstone.`deduplicated_into_asset_id` IS NOT NULL
	  AND tombstone.`storage_key` = NEW.`storage_key_snapshot`
	  AND tombstone.`id` <> NEW.`asset_id`
)
BEGIN
	SELECT RAISE(ABORT, 'An active Review cannot acquire a deduplicated Asset storage key');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_reject_deduplicated_supersession_target_insert`
BEFORE INSERT ON `assets`
WHEN NEW.`superseded_by_asset_id` IS NOT NULL
  AND EXISTS (
	SELECT 1 FROM `assets` target
	WHERE target.`id` = NEW.`superseded_by_asset_id`
	  AND target.`deduplicated_into_asset_id` IS NOT NULL
  )
BEGIN
	SELECT RAISE(ABORT, 'A supersession cannot target a deduplicated Asset');
END;
--> statement-breakpoint
CREATE TRIGGER `assets_reject_deduplicated_supersession_target_update`
BEFORE UPDATE OF `superseded_by_asset_id` ON `assets`
WHEN NEW.`superseded_by_asset_id` IS NOT NULL
  AND EXISTS (
	SELECT 1 FROM `assets` target
	WHERE target.`id` = NEW.`superseded_by_asset_id`
	  AND target.`deduplicated_into_asset_id` IS NOT NULL
  )
BEGIN
	SELECT RAISE(ABORT, 'A supersession cannot target a deduplicated Asset');
END;
