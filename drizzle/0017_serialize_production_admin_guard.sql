-- Serialize active Production Administrator loss through one shared guard row.
--
-- Migration 0016 protects the final active Production Administrator by checking
-- the user table from a trigger. The application also uses a single conditional
-- D1 write. Hosted D1 processes database queries serially, but the local Wrangler
-- smoke can overlap separate user-row writes closely enough to exercise a
-- write-skew-shaped failure. Keeping an explicit active-admin count on one row
-- makes every Admin-loss mutation contend on the same database record while
-- retaining database-level protection for direct Better Auth/user-table writes.

CREATE TABLE `production_admin_guard_state` (
  `id` integer PRIMARY KEY NOT NULL CHECK (`id` = 1),
  `active_admin_count` integer NOT NULL CHECK (`active_admin_count` >= 0)
);
--> statement-breakpoint

INSERT INTO `production_admin_guard_state` (`id`, `active_admin_count`)
SELECT
  1,
  count(*)
FROM `user`
WHERE instr(',' || replace(coalesce(`role`, ''), ' ', '') || ',', ',admin,') > 0
  AND coalesce(`banned`, 0) = 0;
--> statement-breakpoint

DROP TRIGGER IF EXISTS `user_last_active_production_admin_update_guard`;
--> statement-breakpoint
DROP TRIGGER IF EXISTS `user_last_active_production_admin_delete_guard`;
--> statement-breakpoint

CREATE TRIGGER `user_active_production_admin_insert_guard_state`
AFTER INSERT ON `user`
WHEN instr(',' || replace(coalesce(NEW.`role`, ''), ' ', '') || ',', ',admin,') > 0
  AND coalesce(NEW.`banned`, 0) = 0
BEGIN
  UPDATE `production_admin_guard_state`
  SET `active_admin_count` = `active_admin_count` + 1
  WHERE `id` = 1;
END;
--> statement-breakpoint

CREATE TRIGGER `user_last_active_production_admin_update_guard`
BEFORE UPDATE OF `role`, `banned` ON `user`
WHEN instr(',' || replace(coalesce(OLD.`role`, ''), ' ', '') || ',', ',admin,') > 0
  AND coalesce(OLD.`banned`, 0) = 0
  AND NOT (
    instr(',' || replace(coalesce(NEW.`role`, ''), ' ', '') || ',', ',admin,') > 0
    AND coalesce(NEW.`banned`, 0) = 0
  )
BEGIN
  UPDATE `production_admin_guard_state`
  SET `active_admin_count` = `active_admin_count` - 1
  WHERE `id` = 1
    AND `active_admin_count` > 1;

  SELECT CASE
    WHEN changes() <> 1 THEN RAISE(ABORT, 'LAST_ACTIVE_PRODUCTION_ADMIN')
  END;
END;
--> statement-breakpoint

CREATE TRIGGER `user_active_production_admin_update_guard_state`
AFTER UPDATE OF `role`, `banned` ON `user`
WHEN NOT (
    instr(',' || replace(coalesce(OLD.`role`, ''), ' ', '') || ',', ',admin,') > 0
    AND coalesce(OLD.`banned`, 0) = 0
  )
  AND instr(',' || replace(coalesce(NEW.`role`, ''), ' ', '') || ',', ',admin,') > 0
  AND coalesce(NEW.`banned`, 0) = 0
BEGIN
  UPDATE `production_admin_guard_state`
  SET `active_admin_count` = `active_admin_count` + 1
  WHERE `id` = 1;
END;
--> statement-breakpoint

CREATE TRIGGER `user_last_active_production_admin_delete_guard`
BEFORE DELETE ON `user`
WHEN instr(',' || replace(coalesce(OLD.`role`, ''), ' ', '') || ',', ',admin,') > 0
  AND coalesce(OLD.`banned`, 0) = 0
BEGIN
  UPDATE `production_admin_guard_state`
  SET `active_admin_count` = `active_admin_count` - 1
  WHERE `id` = 1
    AND `active_admin_count` > 1;

  SELECT CASE
    WHEN changes() <> 1 THEN RAISE(ABORT, 'LAST_ACTIVE_PRODUCTION_ADMIN')
  END;
END;
