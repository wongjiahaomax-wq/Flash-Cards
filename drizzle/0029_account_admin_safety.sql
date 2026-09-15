-- Keep the final active Production Administrator from being removed by a
-- concurrent or direct user-table mutation. Application actions provide the
-- friendly error; these triggers are the database integrity backstop.

CREATE TRIGGER `user_last_active_production_admin_update_guard`
BEFORE UPDATE OF `role`, `banned` ON `user`
WHEN instr(',' || replace(coalesce(OLD.`role`, ''), ' ', '') || ',', ',admin,') > 0
  AND coalesce(OLD.`banned`, 0) = 0
  AND NOT (
    instr(',' || replace(coalesce(NEW.`role`, ''), ' ', '') || ',', ',admin,') > 0
    AND coalesce(NEW.`banned`, 0) = 0
  )
  AND NOT EXISTS (
    SELECT 1
    FROM `user` AS other_admin
    WHERE other_admin.`id` <> OLD.`id`
      AND instr(',' || replace(coalesce(other_admin.`role`, ''), ' ', '') || ',', ',admin,') > 0
      AND coalesce(other_admin.`banned`, 0) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'LAST_ACTIVE_PRODUCTION_ADMIN');
END;
--> statement-breakpoint

CREATE TRIGGER `user_last_active_production_admin_delete_guard`
BEFORE DELETE ON `user`
WHEN instr(',' || replace(coalesce(OLD.`role`, ''), ' ', '') || ',', ',admin,') > 0
  AND coalesce(OLD.`banned`, 0) = 0
  AND NOT EXISTS (
    SELECT 1
    FROM `user` AS other_admin
    WHERE other_admin.`id` <> OLD.`id`
      AND instr(',' || replace(coalesce(other_admin.`role`, ''), ' ', '') || ',', ',admin,') > 0
      AND coalesce(other_admin.`banned`, 0) = 0
  )
BEGIN
  SELECT RAISE(ABORT, 'LAST_ACTIVE_PRODUCTION_ADMIN');
END;
