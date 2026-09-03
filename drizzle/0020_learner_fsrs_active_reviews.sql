CREATE TABLE `active_reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`case_id` text NOT NULL,
	`system_id` text NOT NULL,
	`study_mode` text NOT NULL,
	`content_mode` text NOT NULL,
	`queue_class` text,
	`run_id` text NOT NULL,
	`scope_fingerprint` text NOT NULL,
	`scope_json` text NOT NULL,
	`generation` integer,
	`review_sequence_epoch` integer,
	`parameter_revision` integer,
	`scheduler_revision` integer,
	`scheduler_library_version` text,
	`expected_state_revision` integer,
	`expected_due_at` integer,
	`run_started_at` integer,
	`case_title_snapshot` text NOT NULL,
	`vignette_snapshot_md` text,
	`snapshot_version` integer DEFAULT 1 NOT NULL,
	`started_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer)) NOT NULL,
	`revealed_at` integer,
	`expires_at` integer DEFAULT (cast((julianday('now') - 2440587.5) * 86400000 as integer) + 604800000) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`case_id`) REFERENCES `cases`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`system_id`) REFERENCES `concepts`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `active_reviews_study_mode_check` CHECK (`study_mode` in ('scheduled', 'free')),
	CONSTRAINT `active_reviews_content_mode_check` CHECK (`content_mode` in ('original', 'expanded')),
	CONSTRAINT `active_reviews_queue_class_check` CHECK (`queue_class` is null or `queue_class` in ('due', 'new', 'repeat')),
	CONSTRAINT `active_reviews_scope_json_check` CHECK (json_valid(`scope_json`)),
	CONSTRAINT `active_reviews_scope_system_check` CHECK (json_extract(`scope_json`, '$.systemId') = `system_id`),
	CONSTRAINT `active_reviews_snapshot_version_check` CHECK (`snapshot_version` = 1),
	CONSTRAINT `active_reviews_expiry_check` CHECK (`expires_at` > `started_at`),
	CONSTRAINT `active_reviews_mode_boundary_check` CHECK ((
		`study_mode` = 'free'
		and `queue_class` is null
		and `generation` is null
		and `review_sequence_epoch` is null
		and `parameter_revision` is null
		and `scheduler_revision` is null
		and `scheduler_library_version` is null
		and `expected_state_revision` is null
		and `expected_due_at` is null
		and `run_started_at` is null
	) or (
		`study_mode` = 'scheduled'
		and `queue_class` is not null
		and `generation` >= 1
		and `review_sequence_epoch` >= 1
		and `parameter_revision` >= 1
		and `scheduler_revision` >= 1
		and `scheduler_library_version` is not null
		and `run_started_at` is not null
		and ((`queue_class` = 'new' and `expected_state_revision` is null and `expected_due_at` is null)
			or (`queue_class` in ('due', 'repeat') and `expected_state_revision` >= 1 and `expected_due_at` is not null))
	))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_reviews_one_per_user_unique` ON `active_reviews` (`user_id`);
--> statement-breakpoint
CREATE INDEX `active_reviews_expiry_idx` ON `active_reviews` (`expires_at`,`user_id`);
--> statement-breakpoint
CREATE INDEX `active_reviews_case_idx` ON `active_reviews` (`case_id`,`user_id`);
--> statement-breakpoint
CREATE INDEX `active_reviews_asset_lifecycle_context_idx` ON `active_reviews` (`system_id`,`user_id`);
--> statement-breakpoint
CREATE TABLE `active_review_questions` (
	`id` text PRIMARY KEY NOT NULL,
	`active_review_id` text NOT NULL,
	`question_prompt_id` text NOT NULL,
	`source_type` text NOT NULL,
	`source_concept_id` text,
	`source_stimulus_group_id` text,
	`source_stimulus_option_id` text,
	`source_asset_question_id` text,
	`source_shared_question_id` text,
	`display_order` integer NOT NULL,
	`prompt_snapshot_md` text NOT NULL,
	`answer_snapshot_md` text NOT NULL,
	FOREIGN KEY (`active_review_id`) REFERENCES `active_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT `active_review_questions_display_order_check` CHECK (`display_order` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_review_questions_order_unique` ON `active_review_questions` (`active_review_id`,`display_order`);
--> statement-breakpoint
CREATE INDEX `active_review_questions_review_idx` ON `active_review_questions` (`active_review_id`,`display_order`);
--> statement-breakpoint
CREATE TABLE `active_review_assets` (
	`id` text PRIMARY KEY NOT NULL,
	`active_review_id` text NOT NULL,
	`asset_id` text NOT NULL,
	`display_order` integer NOT NULL,
	`storage_key_snapshot` text NOT NULL,
	`caption_snapshot_md` text,
	`alt_text_snapshot` text,
	`source_stimulus_group_id` text,
	`source_stimulus_option_id` text,
	FOREIGN KEY (`active_review_id`) REFERENCES `active_reviews`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`asset_id`) REFERENCES `assets`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT `active_review_assets_display_order_check` CHECK (`display_order` >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_review_assets_order_unique` ON `active_review_assets` (`active_review_id`,`display_order`);
--> statement-breakpoint
CREATE UNIQUE INDEX `active_review_assets_asset_unique` ON `active_review_assets` (`active_review_id`,`asset_id`);
--> statement-breakpoint
CREATE INDEX `active_review_assets_asset_idx` ON `active_review_assets` (`asset_id`,`active_review_id`);
--> statement-breakpoint
CREATE TRIGGER `active_reviews_content_scope_guard`
BEFORE INSERT ON `active_reviews`
BEGIN
	SELECT (CASE WHEN NOT EXISTS (
		SELECT 1
		FROM `cases` c
		INNER JOIN `case_concepts` cc
			ON cc.`case_id` = c.`id` AND cc.`role` = 'primary'
		INNER JOIN `concepts` topic
			ON topic.`id` = cc.`concept_id` AND topic.`kind` = 'topic' AND topic.`is_active` = 1
		WHERE c.`id` = NEW.`case_id`
			AND c.`is_active` = 1
			AND c.`preview_session_id` IS NULL
			AND EXISTS (
				SELECT 1 FROM `concepts` system
				WHERE system.`id` = NEW.`system_id`
					AND system.`kind` = 'system'
					AND system.`is_active` = 1
			)
			AND EXISTS (
				SELECT 1
				FROM json_each(NEW.`scope_json`, '$.routes') route
				WHERE (
					json_extract(route.value, '$.routeType') = 'topic'
					AND json_extract(route.value, '$.routeId') = topic.`id`
					AND EXISTS (
						WITH RECURSIVE ancestry(`id`,`parent_id`,`kind`,`is_active`) AS (
							SELECT topic.`id`, topic.`parent_id`, topic.`kind`, topic.`is_active`
							UNION ALL
							SELECT parent.`id`, parent.`parent_id`, parent.`kind`, parent.`is_active`
							FROM `concepts` parent
							INNER JOIN ancestry child ON child.`parent_id` = parent.`id`
						)
						SELECT 1 FROM ancestry
						WHERE `id` = NEW.`system_id` AND `kind` = 'system' AND `is_active` = 1
					)
				) OR (
					json_extract(route.value, '$.routeType') = 'tag'
					AND EXISTS (
						SELECT 1
						FROM `case_tags` ct
						INNER JOIN `tags` t ON t.`id` = ct.`tag_id` AND t.`is_active` = 1
						INNER JOIN `system_tags` st
							ON st.`tag_id` = ct.`tag_id` AND st.`system_concept_id` = NEW.`system_id`
						WHERE ct.`case_id` = NEW.`case_id`
							AND ct.`tag_id` = json_extract(route.value, '$.routeId')
					)
				)
			)
	) THEN RAISE(ABORT, 'active_review_ineligible_scope') END);
END;
--> statement-breakpoint
CREATE TRIGGER `active_reviews_scheduled_boundary_guard`
BEFORE INSERT ON `active_reviews`
WHEN NEW.`study_mode` = 'scheduled'
BEGIN
	SELECT (CASE WHEN NOT EXISTS (
		SELECT 1
		FROM `learner_fsrs_profiles` p
		WHERE p.`user_id` = NEW.`user_id`
			AND p.`generation` = NEW.`generation`
			AND p.`review_sequence_epoch` = NEW.`review_sequence_epoch`
			AND p.`parameter_revision` = NEW.`parameter_revision`
			AND p.`scheduler_revision` = NEW.`scheduler_revision`
			AND p.`scheduler_library_version` = NEW.`scheduler_library_version`
	) THEN RAISE(ABORT, 'active_review_stale_boundary') END);

	SELECT (CASE WHEN NEW.`queue_class` = 'new' AND EXISTS (
		SELECT 1 FROM `learner_case_fsrs` s
		WHERE s.`user_id` = NEW.`user_id` AND s.`case_id` = NEW.`case_id`
	) THEN RAISE(ABORT, 'active_review_stale_case_state') END);

	SELECT (CASE WHEN NEW.`queue_class` = 'due' AND NOT EXISTS (
		SELECT 1
		FROM `learner_case_fsrs` s
		WHERE s.`user_id` = NEW.`user_id`
			AND s.`case_id` = NEW.`case_id`
			AND s.`state_revision` = NEW.`expected_state_revision`
			AND s.`due_at` = NEW.`expected_due_at`
			AND s.`generation` = NEW.`generation`
			AND s.`review_sequence_epoch` = NEW.`review_sequence_epoch`
			AND s.`parameter_revision` = NEW.`parameter_revision`
			AND s.`scheduler_revision` = NEW.`scheduler_revision`
			AND s.`scheduler_library_version` = NEW.`scheduler_library_version`
			AND s.`due_at` <= NEW.`run_started_at`
			AND s.`due_at` <= cast((julianday('now') - 2440587.5) * 86400000 as integer)
	) THEN RAISE(ABORT, 'active_review_stale_case_state') END);

	SELECT (CASE WHEN NEW.`queue_class` = 'repeat' AND NOT EXISTS (
		SELECT 1
		FROM `learner_case_fsrs` s
		WHERE s.`user_id` = NEW.`user_id`
			AND s.`case_id` = NEW.`case_id`
			AND s.`state_revision` = NEW.`expected_state_revision`
			AND s.`due_at` = NEW.`expected_due_at`
			AND s.`generation` = NEW.`generation`
			AND s.`review_sequence_epoch` = NEW.`review_sequence_epoch`
			AND s.`parameter_revision` = NEW.`parameter_revision`
			AND s.`scheduler_revision` = NEW.`scheduler_revision`
			AND s.`scheduler_library_version` = NEW.`scheduler_library_version`
			AND s.`due_at` <= cast((julianday('now') - 2440587.5) * 86400000 as integer)
	) THEN RAISE(ABORT, 'active_review_stale_case_state') END);
END;
