ALTER TABLE `stimulus_group_options` ADD `removed_from_case` integer NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE INDEX `stimulus_group_options_removed_idx` ON `stimulus_group_options` (`stimulus_group_id`, `removed_from_case`);
