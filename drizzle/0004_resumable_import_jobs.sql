CREATE TABLE `import_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`package_id` text NOT NULL,
	`package_sha256` text NOT NULL,
	`package_storage_key` text NOT NULL,
	`status` text DEFAULT 'validating' NOT NULL,
	`phase` text NOT NULL,
	`cursor` integer DEFAULT 0 NOT NULL,
	`processed_count` integer DEFAULT 0 NOT NULL,
	`total_count` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`completed_at` integer,
	`last_error` text,
	`lease_token` text,
	`lease_expires_at` integer,
	CONSTRAINT `import_jobs_status_check` CHECK(`status` in ('validating', 'ready', 'importing', 'complete', 'failed', 'cancelled')),
	CONSTRAINT `import_jobs_cursor_check` CHECK(`cursor` >= 0),
	CONSTRAINT `import_jobs_processed_count_check` CHECK(`processed_count` >= 0),
	CONSTRAINT `import_jobs_total_count_check` CHECK(`total_count` >= 0),
	CONSTRAINT `import_jobs_progress_check` CHECK(`processed_count` <= `total_count`)
);

CREATE UNIQUE INDEX `import_jobs_storage_key_unique` ON `import_jobs` (`package_storage_key`);
CREATE INDEX `import_jobs_status_updated_idx` ON `import_jobs` (`status`, `updated_at`);
CREATE INDEX `import_jobs_created_at_idx` ON `import_jobs` (`created_at`);
