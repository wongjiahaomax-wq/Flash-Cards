ALTER TABLE `concepts` ADD `kind` text NOT NULL DEFAULT 'topic' CHECK (`kind` IN ('system', 'topic'));
--> statement-breakpoint
CREATE INDEX `concepts_kind_active_parent_idx` ON `concepts` (`kind`, `is_active`, `parent_id`);
--> statement-breakpoint
CREATE TABLE `system_tags` (
  `system_concept_id` text NOT NULL,
  `tag_id` text NOT NULL,
  `display_order` integer NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  PRIMARY KEY (`system_concept_id`, `tag_id`),
  FOREIGN KEY (`system_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
  FOREIGN KEY (`tag_id`) REFERENCES `tags`(`id`) ON UPDATE no action ON DELETE restrict,
  CONSTRAINT `system_tags_display_order_nonnegative` CHECK (`display_order` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `system_tags_system_order_unique` ON `system_tags` (`system_concept_id`, `display_order`);
--> statement-breakpoint
CREATE INDEX `system_tags_tag_system_idx` ON `system_tags` (`tag_id`, `system_concept_id`);
--> statement-breakpoint
CREATE TRIGGER `concepts_system_top_level_insert`
BEFORE INSERT ON `concepts`
WHEN NEW.`kind` = 'system' AND NEW.`parent_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'System concepts must be top-level.');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_system_top_level_update`
BEFORE UPDATE OF `kind`, `parent_id` ON `concepts`
WHEN NEW.`kind` = 'system' AND NEW.`parent_id` IS NOT NULL
BEGIN
  SELECT RAISE(ABORT, 'System concepts must be top-level.');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_parent_must_be_active_insert`
BEFORE INSERT ON `concepts`
WHEN NEW.`parent_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `concepts` parent
    WHERE parent.`id` = NEW.`parent_id` AND parent.`is_active` = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Concept parent must exist and be active.');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_parent_must_be_active_update`
BEFORE UPDATE OF `parent_id`, `is_active` ON `concepts`
WHEN NEW.`parent_id` IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM `concepts` parent
    WHERE parent.`id` = NEW.`parent_id` AND parent.`is_active` = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Concept parent must exist and be active.');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_no_cycle_update`
BEFORE UPDATE OF `parent_id` ON `concepts`
WHEN NEW.`parent_id` IS NOT NULL
BEGIN
  SELECT CASE
    WHEN NEW.`parent_id` = NEW.`id`
    THEN RAISE(ABORT, 'Concept cannot be its own parent.')
  END;

  WITH RECURSIVE ancestors(`id`, `parent_id`) AS (
    SELECT `id`, `parent_id` FROM `concepts` WHERE `id` = NEW.`parent_id`
    UNION ALL
    SELECT concept.`id`, concept.`parent_id`
    FROM `concepts` concept
    INNER JOIN ancestors ON concept.`id` = ancestors.`parent_id`
  )
  SELECT RAISE(ABORT, 'Concept hierarchy cannot contain a cycle.')
  WHERE EXISTS (SELECT 1 FROM ancestors WHERE `id` = NEW.`id`);
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_active_children_block_deactivation`
BEFORE UPDATE OF `is_active` ON `concepts`
WHEN OLD.`is_active` = 1 AND NEW.`is_active` = 0
  AND EXISTS (
    SELECT 1 FROM `concepts` child
    WHERE child.`parent_id` = NEW.`id` AND child.`is_active` = 1
  )
BEGIN
  SELECT RAISE(ABORT, 'Deactivate or move active child concepts first.');
END;
--> statement-breakpoint
CREATE TRIGGER `case_concepts_topic_only_insert`
BEFORE INSERT ON `case_concepts`
WHEN NOT EXISTS (
  SELECT 1 FROM `concepts`
  WHERE `id` = NEW.`concept_id` AND `kind` = 'topic'
)
BEGIN
  SELECT RAISE(ABORT, 'Cases may only attach to Topics, not Systems.');
END;
--> statement-breakpoint
CREATE TRIGGER `case_concepts_topic_only_update`
BEFORE UPDATE OF `concept_id` ON `case_concepts`
WHEN NOT EXISTS (
  SELECT 1 FROM `concepts`
  WHERE `id` = NEW.`concept_id` AND `kind` = 'topic'
)
BEGIN
  SELECT RAISE(ABORT, 'Cases may only attach to Topics, not Systems.');
END;
--> statement-breakpoint
CREATE TRIGGER `concept_questions_topic_only_insert`
BEFORE INSERT ON `concept_questions`
WHEN NOT EXISTS (
  SELECT 1 FROM `concepts`
  WHERE `id` = NEW.`concept_id` AND `kind` = 'topic'
)
BEGIN
  SELECT RAISE(ABORT, 'Reusable Concept Questions may only attach to Topics.');
END;
--> statement-breakpoint
CREATE TRIGGER `concept_questions_topic_only_update`
BEFORE UPDATE OF `concept_id` ON `concept_questions`
WHEN NOT EXISTS (
  SELECT 1 FROM `concepts`
  WHERE `id` = NEW.`concept_id` AND `kind` = 'topic'
)
BEGIN
  SELECT RAISE(ABORT, 'Reusable Concept Questions may only attach to Topics.');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_used_topic_block_system_kind`
BEFORE UPDATE OF `kind` ON `concepts`
WHEN OLD.`kind` = 'topic' AND NEW.`kind` = 'system'
  AND (
    EXISTS (SELECT 1 FROM `case_concepts` WHERE `concept_id` = OLD.`id`)
    OR EXISTS (SELECT 1 FROM `concept_questions` WHERE `concept_id` = OLD.`id`)
  )
BEGIN
  SELECT RAISE(ABORT, 'Move Case and reusable-question Topic usages before classifying as a System.');
END;
--> statement-breakpoint
CREATE TRIGGER `system_tags_active_system_insert`
BEFORE INSERT ON `system_tags`
WHEN NOT EXISTS (
  SELECT 1 FROM `concepts`
  WHERE `id` = NEW.`system_concept_id`
    AND `kind` = 'system'
    AND `is_active` = 1
)
BEGIN
  SELECT RAISE(ABORT, 'System Tag relationships require an active System.');
END;
--> statement-breakpoint
CREATE TRIGGER `system_tags_active_system_update`
BEFORE UPDATE OF `system_concept_id` ON `system_tags`
WHEN NOT EXISTS (
  SELECT 1 FROM `concepts`
  WHERE `id` = NEW.`system_concept_id`
    AND `kind` = 'system'
    AND `is_active` = 1
)
BEGIN
  SELECT RAISE(ABORT, 'System Tag relationships require an active System.');
END;
--> statement-breakpoint
CREATE TRIGGER `system_tags_active_tag_insert`
BEFORE INSERT ON `system_tags`
WHEN NOT EXISTS (
  SELECT 1 FROM `tags`
  WHERE `id` = NEW.`tag_id` AND `is_active` = 1
)
BEGIN
  SELECT RAISE(ABORT, 'System Tag relationships require an active Tag.');
END;
--> statement-breakpoint
CREATE TRIGGER `system_tags_active_tag_update`
BEFORE UPDATE OF `tag_id` ON `system_tags`
WHEN NOT EXISTS (
  SELECT 1 FROM `tags`
  WHERE `id` = NEW.`tag_id` AND `is_active` = 1
)
BEGIN
  SELECT RAISE(ABORT, 'System Tag relationships require an active Tag.');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_system_tags_block_kind_change`
BEFORE UPDATE OF `kind` ON `concepts`
WHEN OLD.`kind` = 'system' AND NEW.`kind` <> 'system'
  AND EXISTS (SELECT 1 FROM `system_tags` WHERE `system_concept_id` = OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'Remove System Tag relationships before changing System kind.');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_system_tags_block_deactivation`
BEFORE UPDATE OF `is_active` ON `concepts`
WHEN OLD.`kind` = 'system' AND NEW.`is_active` = 0
  AND EXISTS (SELECT 1 FROM `system_tags` WHERE `system_concept_id` = OLD.`id`)
BEGIN
  SELECT RAISE(ABORT, 'Remove System Tag relationships before deactivating a System.');
END;
--> statement-breakpoint
ALTER TABLE `reviews` ADD `study_system_concept_id` text REFERENCES `concepts`(`id`) ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE `reviews` ADD `route_type` text NOT NULL DEFAULT 'topic' CHECK (`route_type` IN ('topic', 'tag'));
--> statement-breakpoint
ALTER TABLE `reviews` ADD `study_tag_id` text REFERENCES `tags`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `reviews_study_system_completed_idx` ON `reviews` (`study_system_concept_id`, `completed_at`);
--> statement-breakpoint
CREATE INDEX `reviews_study_tag_completed_idx` ON `reviews` (`study_tag_id`, `completed_at`);
--> statement-breakpoint
CREATE TRIGGER `reviews_route_provenance_insert`
BEFORE INSERT ON `reviews`
WHEN (
  (NEW.`route_type` = 'topic' AND NEW.`study_tag_id` IS NOT NULL)
  OR
  (NEW.`route_type` = 'tag' AND (NEW.`study_tag_id` IS NULL OR NEW.`study_system_concept_id` IS NULL))
  OR
  (NEW.`study_system_concept_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `concepts`
    WHERE `id` = NEW.`study_system_concept_id` AND `kind` = 'system'
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'Review study-route provenance is invalid.');
END;
--> statement-breakpoint
CREATE TRIGGER `reviews_route_provenance_update`
BEFORE UPDATE OF `study_system_concept_id`, `route_type`, `study_tag_id` ON `reviews`
WHEN (
  (NEW.`route_type` = 'topic' AND NEW.`study_tag_id` IS NOT NULL)
  OR
  (NEW.`route_type` = 'tag' AND (NEW.`study_tag_id` IS NULL OR NEW.`study_system_concept_id` IS NULL))
  OR
  (NEW.`study_system_concept_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `concepts`
    WHERE `id` = NEW.`study_system_concept_id` AND `kind` = 'system'
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'Review study-route provenance is invalid.');
END;
