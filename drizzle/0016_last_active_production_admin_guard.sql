-- Enforce the Account Management invariant that at least one active Production
-- Administrator remains once an active admin is being removed. Application
-- preflight checks provide friendly errors, but they are check-then-mutate and
-- can race. These SQLite/D1 triggers are evaluated in the write transaction,
-- so concurrent demote/disable/delete attempts cannot both remove the final
-- active admin.
--
-- Better Auth stores multiple roles as a comma-separated string. Normalizing
-- spaces and padding with commas avoids matching unrelated role names.

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
