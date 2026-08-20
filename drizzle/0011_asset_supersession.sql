ALTER TABLE `assets` ADD `superseded_by_asset_id` text REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict;
--> statement-breakpoint
CREATE INDEX `assets_superseded_by_idx` ON `assets` (`superseded_by_asset_id`);
