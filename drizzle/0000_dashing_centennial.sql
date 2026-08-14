CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`type` text DEFAULT 'image' NOT NULL,
	`storage_key` text NOT NULL,
	`mime_type` text NOT NULL,
	`original_filename` text,
	`alt_text` text,
	`source_label` text,
	`source_url` text,
	`licence` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assets_storage_key_unique` ON `assets` (`storage_key`);--> statement-breakpoint
CREATE INDEX `assets_active_idx` ON `assets` (`is_active`);--> statement-breakpoint
CREATE TABLE `case_assets` (
	`case_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`display_order` integer NOT NULL,
	`caption_md` text,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`case_id`, `asset_id`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "case_assets_display_order_nonnegative" CHECK("case_assets"."display_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_assets_case_order_unique` ON `case_assets` (`case_id`,`display_order`);--> statement-breakpoint
CREATE INDEX `case_assets_asset_idx` ON `case_assets` (`asset_id`);--> statement-breakpoint
CREATE TABLE `case_concepts` (
	`case_id` text NOT NULL,
	`concept_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	PRIMARY KEY(`case_id`, `concept_id`),
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "case_concepts_role_check" CHECK("case_concepts"."role" in ('primary', 'secondary'))
);
--> statement-breakpoint
CREATE INDEX `case_concepts_concept_idx` ON `case_concepts` (`concept_id`);--> statement-breakpoint
CREATE INDEX `case_concepts_case_role_idx` ON `case_concepts` (`case_id`,`role`);--> statement-breakpoint
CREATE TABLE `case_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`case_id` text NOT NULL,
	`question_prompt_id` text NOT NULL,
	`answer_md` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `case_questions_case_prompt_unique` ON `case_questions` (`case_id`,`question_prompt_id`);--> statement-breakpoint
CREATE INDEX `case_questions_prompt_idx` ON `case_questions` (`question_prompt_id`);--> statement-breakpoint
CREATE INDEX `case_questions_case_active_idx` ON `case_questions` (`case_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `cases` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`vignette_md` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `cases_active_idx` ON `cases` (`is_active`);--> statement-breakpoint
CREATE TABLE `concept_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`concept_id` text NOT NULL,
	`question_prompt_id` text NOT NULL,
	`answer_md` text NOT NULL,
	`inherit_to_descendants` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concept_questions_concept_prompt_unique` ON `concept_questions` (`concept_id`,`question_prompt_id`);--> statement-breakpoint
CREATE INDEX `concept_questions_prompt_idx` ON `concept_questions` (`question_prompt_id`);--> statement-breakpoint
CREATE INDEX `concept_questions_concept_active_idx` ON `concept_questions` (`concept_id`,`is_active`);--> statement-breakpoint
CREATE TABLE `concepts` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`slug` text NOT NULL,
	`description_md` text,
	`parent_id` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "concepts_parent_not_self" CHECK("concepts"."parent_id" is null or "concepts"."parent_id" <> "concepts"."id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `concepts_slug_unique` ON `concepts` (`slug`);--> statement-breakpoint
CREATE INDEX `concepts_parent_idx` ON `concepts` (`parent_id`);--> statement-breakpoint
CREATE TABLE `question_prompts` (
	`id` text PRIMARY KEY NOT NULL,
	`prompt_md` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch() * 1000) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `question_prompts_active_idx` ON `question_prompts` (`is_active`);--> statement-breakpoint
CREATE TABLE `review_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`display_order` integer NOT NULL,
	`storage_key_snapshot` text NOT NULL,
	`caption_snapshot_md` text,
	`alt_text_snapshot` text,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "review_assets_display_order_nonnegative" CHECK("review_assets"."display_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_assets_review_order_unique` ON `review_assets` (`review_id`,`display_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_assets_review_asset_unique` ON `review_assets` (`review_id`,`asset_id`);--> statement-breakpoint
CREATE TABLE `review_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`review_id` text NOT NULL,
	`question_prompt_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_concept_id` text,
	`display_order` integer NOT NULL,
	`prompt_snapshot_md` text NOT NULL,
	`answer_snapshot_md` text NOT NULL,
	FOREIGN KEY (`review_id`) REFERENCES `reviews`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`question_prompt_id`) REFERENCES `question_prompts`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`source_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "review_questions_source_type_check" CHECK("review_questions"."source_type" in ('case', 'concept', 'ancestor_concept')),
	CONSTRAINT "review_questions_display_order_nonnegative" CHECK("review_questions"."display_order" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_questions_review_order_unique` ON `review_questions` (`review_id`,`display_order`);--> statement-breakpoint
CREATE UNIQUE INDEX `review_questions_review_prompt_unique` ON `review_questions` (`review_id`,`question_prompt_id`);--> statement-breakpoint
CREATE INDEX `review_questions_prompt_idx` ON `review_questions` (`question_prompt_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`primary_concept_id` text NOT NULL,
	`case_title_snapshot` text NOT NULL,
	`vignette_snapshot_md` text,
	`status` text DEFAULT 'started' NOT NULL,
	`rating` text,
	`started_at` integer DEFAULT (unixepoch() * 1000) NOT NULL,
	`revealed_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`primary_concept_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "reviews_status_check" CHECK("reviews"."status" in ('started', 'completed')),
	CONSTRAINT "reviews_rating_check" CHECK("reviews"."rating" is null or "reviews"."rating" in ('again', 'good'))
);
--> statement-breakpoint
CREATE INDEX `reviews_user_completed_idx` ON `reviews` (`user_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `reviews_case_completed_idx` ON `reviews` (`case_id`,`completed_at`);--> statement-breakpoint
CREATE INDEX `reviews_concept_completed_idx` ON `reviews` (`primary_concept_id`,`completed_at`);