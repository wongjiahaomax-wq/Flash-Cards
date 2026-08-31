CREATE TABLE `study_selections` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `system_concept_id` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  FOREIGN KEY (`system_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `study_selections_user_system_created_idx` ON `study_selections` (`user_id`, `system_concept_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE `study_selection_routes` (
  `study_selection_id` text NOT NULL,
  `route_type` text NOT NULL CHECK (`route_type` IN ('topic', 'tag')),
  `route_id` text NOT NULL,
  PRIMARY KEY (`study_selection_id`, `route_type`, `route_id`),
  FOREIGN KEY (`study_selection_id`) REFERENCES `study_selections`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `study_selection_routes_route_lookup_idx` ON `study_selection_routes` (`route_type`, `route_id`);
--> statement-breakpoint
ALTER TABLE `reviews` ADD `study_selection_id` text REFERENCES `study_selections`(`id`) ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `reviews_study_selection_idx` ON `reviews` (`study_selection_id`);
--> statement-breakpoint
CREATE TRIGGER `study_selections_valid_system_insert`
BEFORE INSERT ON `study_selections`
WHEN NOT EXISTS (
  SELECT 1 FROM `concepts`
  WHERE `id` = NEW.`system_concept_id`
    AND `kind` = 'system'
    AND `is_active` = 1
    AND `parent_id` IS NULL
)
BEGIN
  SELECT RAISE(ABORT, 'Study selections require an active top-level System.');
END;
--> statement-breakpoint
CREATE TRIGGER `study_selections_immutable_update`
BEFORE UPDATE ON `study_selections`
BEGIN
  SELECT RAISE(ABORT, 'Study selections are immutable.');
END;
--> statement-breakpoint
CREATE TRIGGER `study_selections_immutable_delete`
BEFORE DELETE ON `study_selections`
BEGIN
  SELECT RAISE(ABORT, 'Study selections are immutable.');
END;
--> statement-breakpoint
CREATE TRIGGER `study_selection_routes_valid_topic_insert`
BEFORE INSERT ON `study_selection_routes`
WHEN NEW.`route_type` = 'topic' AND NOT EXISTS (
  WITH RECURSIVE ancestors(`id`, `parent_id`, `kind`) AS (
    SELECT `id`, `parent_id`, `kind`
    FROM `concepts`
    WHERE `id` = NEW.`route_id` AND `kind` = 'topic' AND `is_active` = 1
    UNION ALL
    SELECT parent.`id`, parent.`parent_id`, parent.`kind`
    FROM `concepts` parent
    INNER JOIN ancestors child ON parent.`id` = child.`parent_id`
  )
  SELECT 1 FROM ancestors
  WHERE `id` = (
    SELECT `system_concept_id` FROM `study_selections`
    WHERE `id` = NEW.`study_selection_id`
  ) AND `kind` = 'system'
)
BEGIN
  SELECT RAISE(ABORT, 'Study selection Topic route is not available in this System.');
END;
--> statement-breakpoint
CREATE TRIGGER `study_selection_routes_valid_tag_insert`
BEFORE INSERT ON `study_selection_routes`
WHEN NEW.`route_type` = 'tag' AND NOT EXISTS (
  SELECT 1
  FROM `study_selections` selection
  INNER JOIN `system_tags` relation
    ON relation.`system_concept_id` = selection.`system_concept_id`
  INNER JOIN `tags` tag
    ON tag.`id` = relation.`tag_id`
  WHERE selection.`id` = NEW.`study_selection_id`
    AND relation.`tag_id` = NEW.`route_id`
    AND tag.`is_active` = 1
)
BEGIN
  SELECT RAISE(ABORT, 'Study selection Tag route is not curated for this System.');
END;
--> statement-breakpoint
CREATE TRIGGER `study_selection_routes_immutable_update`
BEFORE UPDATE ON `study_selection_routes`
BEGIN
  SELECT RAISE(ABORT, 'Study selection routes are immutable.');
END;
--> statement-breakpoint
CREATE TRIGGER `study_selection_routes_immutable_delete`
BEFORE DELETE ON `study_selection_routes`
BEGIN
  SELECT RAISE(ABORT, 'Study selection routes are immutable.');
END;
--> statement-breakpoint
DROP TRIGGER `reviews_route_provenance_insert`;
--> statement-breakpoint
DROP TRIGGER `reviews_route_provenance_update`;
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
  OR
  (NEW.`study_system_concept_id` IS NULL AND (
    NEW.`navigation_route_type` IS NOT NULL
    OR NEW.`navigation_route_id` IS NOT NULL
    OR NEW.`study_selection_id` IS NOT NULL
  ))
  OR
  (NEW.`study_system_concept_id` IS NOT NULL AND NEW.`study_selection_id` IS NULL AND NEW.`navigation_route_type` IS NULL)
  OR
  (NEW.`study_selection_id` IS NOT NULL AND (
    NEW.`navigation_route_type` IS NOT NULL
    OR NEW.`navigation_route_id` IS NOT NULL
  ))
  OR
  (NEW.`study_selection_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `study_selections` selection
    WHERE selection.`id` = NEW.`study_selection_id`
      AND selection.`user_id` = NEW.`user_id`
      AND selection.`system_concept_id` = NEW.`study_system_concept_id`
  ))
  OR
  (NEW.`study_selection_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `study_selection_routes`
    WHERE `study_selection_id` = NEW.`study_selection_id`
  ))
  OR
  (NEW.`navigation_route_type` = 'all' AND NEW.`navigation_route_id` IS NOT NULL)
  OR
  (NEW.`navigation_route_type` = 'topic' AND (
    NEW.`route_type` <> 'topic'
    OR NEW.`navigation_route_id` IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM `concepts`
      WHERE `id` = NEW.`navigation_route_id` AND `kind` = 'topic'
    )
  ))
  OR
  (NEW.`navigation_route_type` = 'tag' AND (
    NEW.`route_type` <> 'tag'
    OR NEW.`navigation_route_id` IS NULL
    OR NEW.`navigation_route_id` <> NEW.`study_tag_id`
    OR NOT EXISTS (
      SELECT 1 FROM `tags`
      WHERE `id` = NEW.`navigation_route_id`
    )
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'Review study-route provenance is invalid.');
END;
--> statement-breakpoint
CREATE TRIGGER `reviews_route_provenance_update`
BEFORE UPDATE OF `user_id`, `study_system_concept_id`, `route_type`, `study_tag_id`, `navigation_route_type`, `navigation_route_id`, `study_selection_id` ON `reviews`
WHEN (
  (NEW.`route_type` = 'topic' AND NEW.`study_tag_id` IS NOT NULL)
  OR
  (NEW.`route_type` = 'tag' AND (NEW.`study_tag_id` IS NULL OR NEW.`study_system_concept_id` IS NULL))
  OR
  (NEW.`study_system_concept_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `concepts`
    WHERE `id` = NEW.`study_system_concept_id` AND `kind` = 'system'
  ))
  OR
  (NEW.`study_system_concept_id` IS NULL AND (
    NEW.`navigation_route_type` IS NOT NULL
    OR NEW.`navigation_route_id` IS NOT NULL
    OR NEW.`study_selection_id` IS NOT NULL
  ))
  OR
  (NEW.`study_system_concept_id` IS NOT NULL AND NEW.`study_selection_id` IS NULL AND NEW.`navigation_route_type` IS NULL)
  OR
  (NEW.`study_selection_id` IS NOT NULL AND (
    NEW.`navigation_route_type` IS NOT NULL
    OR NEW.`navigation_route_id` IS NOT NULL
  ))
  OR
  (NEW.`study_selection_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `study_selections` selection
    WHERE selection.`id` = NEW.`study_selection_id`
      AND selection.`user_id` = NEW.`user_id`
      AND selection.`system_concept_id` = NEW.`study_system_concept_id`
  ))
  OR
  (NEW.`study_selection_id` IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM `study_selection_routes`
    WHERE `study_selection_id` = NEW.`study_selection_id`
  ))
  OR
  (NEW.`navigation_route_type` = 'all' AND NEW.`navigation_route_id` IS NOT NULL)
  OR
  (NEW.`navigation_route_type` = 'topic' AND (
    NEW.`route_type` <> 'topic'
    OR NEW.`navigation_route_id` IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM `concepts`
      WHERE `id` = NEW.`navigation_route_id` AND `kind` = 'topic'
    )
  ))
  OR
  (NEW.`navigation_route_type` = 'tag' AND (
    NEW.`route_type` <> 'tag'
    OR NEW.`navigation_route_id` IS NULL
    OR NEW.`navigation_route_id` <> NEW.`study_tag_id`
    OR NOT EXISTS (
      SELECT 1 FROM `tags`
      WHERE `id` = NEW.`navigation_route_id`
    )
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'Review study-route provenance is invalid.');
END;
