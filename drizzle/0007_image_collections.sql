-- Image Library organisation is intentionally separate from Case Topics and Tags.
CREATE TABLE `image_collections` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `created_at` integer NOT NULL DEFAULT (unixepoch() * 1000),
  `updated_at` integer NOT NULL DEFAULT (unixepoch() * 1000)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `image_collections_name_unique` ON `image_collections` (`name`);
--> statement-breakpoint
CREATE INDEX `image_collections_name_idx` ON `image_collections` (`name`);
--> statement-breakpoint
ALTER TABLE `assets` ADD COLUMN `image_collection_id` text REFERENCES `image_collections`(`id`) ON DELETE SET NULL;
--> statement-breakpoint
CREATE INDEX `assets_image_collection_idx` ON `assets` (`image_collection_id`);
