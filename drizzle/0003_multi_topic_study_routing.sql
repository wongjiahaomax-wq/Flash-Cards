PRAGMA foreign_keys=OFF;
CREATE TABLE `reviews_new` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`primary_concept_id` text NOT NULL,
	`study_concept_id` text NOT NULL,
	`case_title_snapshot` text NOT NULL,
	`vignette_snapshot_md` text,
	`status` text DEFAULT 'started' NOT NULL,
	`rating` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revealed_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`primary_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`study_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `reviews_status_check` CHECK(`status` in ('started', 'completed')),
	CONSTRAINT `reviews_rating_check` CHECK(`rating` is null or `rating` in ('again', 'good'))
);
INSERT INTO `reviews_new` (
	`id`, `user_id`, `case_id`, `primary_concept_id`, `study_concept_id`,
	`case_title_snapshot`, `vignette_snapshot_md`, `status`, `rating`,
	`started_at`, `revealed_at`, `completed_at`
)
SELECT
	`id`, `user_id`, `case_id`, `primary_concept_id`, `primary_concept_id`,
	`case_title_snapshot`, `vignette_snapshot_md`, `status`, `rating`,
	`started_at`, `revealed_at`, `completed_at`
FROM `reviews`;
DROP TABLE `reviews`;
ALTER TABLE `reviews_new` RENAME TO `reviews`;
CREATE INDEX `reviews_user_completed_idx` ON `reviews` (`user_id`, `completed_at`);
CREATE INDEX `reviews_case_completed_idx` ON `reviews` (`case_id`, `completed_at`);
CREATE INDEX `reviews_concept_completed_idx` ON `reviews` (`primary_concept_id`, `completed_at`);
CREATE INDEX `reviews_study_concept_completed_idx` ON `reviews` (`study_concept_id`, `completed_at`);
PRAGMA foreign_keys=ON;
