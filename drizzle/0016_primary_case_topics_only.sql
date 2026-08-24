-- Additional Study Topics are removed from current authoring/routing behavior.
-- This migration is intentionally non-destructive: it refuses to apply while
-- any legacy Case has anything other than one stored primary Topic relation.
-- Operators must first complete the reviewed stable-ID Topic -> Tag/reachability
-- migration. Historical Review study_concept_id provenance is not touched.

CREATE TABLE `_migration_0016_case_topic_guard` (
  `ok` integer NOT NULL CHECK (`ok` = 1)
);
--> statement-breakpoint
INSERT INTO `_migration_0016_case_topic_guard` (`ok`)
SELECT CASE
  WHEN EXISTS (
    SELECT 1
    FROM `case_concepts`
    GROUP BY `case_id`
    HAVING COUNT(*) <> 1
       OR SUM(CASE WHEN `role` = 'primary' THEN 1 ELSE 0 END) <> 1
  ) THEN 0
  ELSE 1
END;
--> statement-breakpoint
DROP TABLE `_migration_0016_case_topic_guard`;
--> statement-breakpoint

CREATE TRIGGER `case_concepts_primary_only_insert`
BEFORE INSERT ON `case_concepts`
WHEN NEW.`role` <> 'primary'
BEGIN
  SELECT RAISE(ABORT, 'Cases may only have a canonical Primary Topic. Use Case Tags for alternate classification.');
END;
--> statement-breakpoint
CREATE TRIGGER `case_concepts_primary_only_update`
BEFORE UPDATE OF `role` ON `case_concepts`
WHEN NEW.`role` <> 'primary'
BEGIN
  SELECT RAISE(ABORT, 'Cases may only have a canonical Primary Topic. Use Case Tags for alternate classification.');
END;
--> statement-breakpoint
CREATE TRIGGER `case_concepts_one_topic_insert`
BEFORE INSERT ON `case_concepts`
WHEN EXISTS (
  SELECT 1 FROM `case_concepts` existing
  WHERE existing.`case_id` = NEW.`case_id`
)
BEGIN
  SELECT RAISE(ABORT, 'A Case may have only one canonical Topic relationship.');
END;
--> statement-breakpoint
CREATE TRIGGER `case_concepts_one_topic_move`
BEFORE UPDATE OF `case_id` ON `case_concepts`
WHEN NEW.`case_id` <> OLD.`case_id`
  AND EXISTS (
    SELECT 1 FROM `case_concepts` existing
    WHERE existing.`case_id` = NEW.`case_id`
  )
BEGIN
  SELECT RAISE(ABORT, 'A Case may have only one canonical Topic relationship.');
END;