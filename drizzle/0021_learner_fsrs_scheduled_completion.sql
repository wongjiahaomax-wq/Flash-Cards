ALTER TABLE `scheduled_review_events` ADD COLUMN `queue_class` text CHECK (`queue_class` is null or `queue_class` in ('due', 'new', 'repeat'));
--> statement-breakpoint
ALTER TABLE `scheduled_review_events` ADD COLUMN `run_id` text;
--> statement-breakpoint
ALTER TABLE `scheduled_review_events` ADD COLUMN `scope_fingerprint` text;
--> statement-breakpoint
ALTER TABLE `scheduled_review_events` ADD COLUMN `run_started_at` integer;
--> statement-breakpoint
ALTER TABLE `scheduled_review_events` ADD COLUMN `resulting_state` integer CHECK (`resulting_state` is null or `resulting_state` between 0 and 3);
--> statement-breakpoint
CREATE TRIGGER `scheduled_review_events_active_guard`
BEFORE INSERT ON `scheduled_review_events`
BEGIN
	SELECT CASE WHEN NEW.`queue_class` IS NULL
		OR NEW.`run_id` IS NULL
		OR NEW.`scope_fingerprint` IS NULL
		OR NEW.`run_started_at` IS NULL
		OR NEW.`resulting_state` IS NULL
	THEN RAISE(ABORT, 'scheduled_completion_missing_context') END;

	SELECT CASE WHEN NOT EXISTS (
		SELECT 1
		FROM `active_reviews` a
		WHERE a.`id` = NEW.`id`
			AND a.`user_id` = NEW.`user_id`
			AND a.`case_id` = NEW.`case_id`
			AND a.`system_id` = NEW.`system_id`
			AND a.`study_mode` = 'scheduled'
			AND a.`content_mode` = NEW.`content_mode`
			AND a.`queue_class` = NEW.`queue_class`
			AND a.`run_id` = NEW.`run_id`
			AND a.`scope_fingerprint` = NEW.`scope_fingerprint`
			AND a.`run_started_at` = NEW.`run_started_at`
			AND a.`generation` = NEW.`generation`
			AND a.`review_sequence_epoch` = NEW.`review_sequence_epoch`
			AND a.`parameter_revision` = NEW.`parameter_revision`
			AND a.`scheduler_revision` = NEW.`scheduler_revision`
			AND a.`scheduler_library_version` = NEW.`scheduler_library_version`
	) THEN RAISE(ABORT, 'scheduled_completion_active_review_changed') END;

	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `active_reviews` a
		WHERE a.`id` = NEW.`id`
			AND a.`user_id` = NEW.`user_id`
			AND a.`revealed_at` IS NOT NULL
	) THEN RAISE(ABORT, 'scheduled_completion_unrevealed') END;

	SELECT CASE WHEN NOT EXISTS (
		SELECT 1 FROM `active_reviews` a
		WHERE a.`id` = NEW.`id`
			AND a.`user_id` = NEW.`user_id`
			AND a.`expires_at` > cast((julianday('now') - 2440587.5) * 86400000 as integer)
	) THEN RAISE(ABORT, 'scheduled_completion_expired') END;

	SELECT CASE WHEN NOT EXISTS (
		SELECT 1
		FROM `learner_fsrs_profiles` p
		WHERE p.`user_id` = NEW.`user_id`
			AND p.`generation` = NEW.`generation`
			AND p.`review_sequence_epoch` = NEW.`review_sequence_epoch`
			AND p.`parameter_revision` = NEW.`parameter_revision`
			AND p.`scheduler_revision` = NEW.`scheduler_revision`
			AND p.`scheduler_library_version` = NEW.`scheduler_library_version`
	) THEN RAISE(ABORT, 'scheduled_completion_stale_boundary') END;

	SELECT CASE WHEN NEW.`queue_class` = 'new' AND (
		EXISTS (
			SELECT 1 FROM `learner_case_fsrs` s
			WHERE s.`user_id` = NEW.`user_id` AND s.`case_id` = NEW.`case_id`
		)
		OR NEW.`resulting_state_revision` <> 1
	) THEN RAISE(ABORT, 'scheduled_completion_stale_case_state') END;

	SELECT CASE WHEN NEW.`queue_class` IN ('due', 'repeat') AND NOT EXISTS (
		SELECT 1
		FROM `active_reviews` a
		INNER JOIN `learner_case_fsrs` s
			ON s.`user_id` = a.`user_id` AND s.`case_id` = a.`case_id`
		WHERE a.`id` = NEW.`id`
			AND a.`user_id` = NEW.`user_id`
			AND s.`state_revision` = a.`expected_state_revision`
			AND s.`due_at` = a.`expected_due_at`
			AND s.`generation` = NEW.`generation`
			AND s.`review_sequence_epoch` = NEW.`review_sequence_epoch`
			AND s.`parameter_revision` = NEW.`parameter_revision`
			AND s.`scheduler_revision` = NEW.`scheduler_revision`
			AND s.`scheduler_library_version` = NEW.`scheduler_library_version`
			AND NEW.`resulting_state_revision` = s.`state_revision` + 1
	) THEN RAISE(ABORT, 'scheduled_completion_stale_case_state') END;
END;
--> statement-breakpoint
CREATE TRIGGER `active_reviews_scheduled_completion_expiry_guard`
BEFORE DELETE ON `active_reviews`
WHEN OLD.`study_mode` = 'scheduled'
	AND EXISTS (
		SELECT 1 FROM `scheduled_review_events` e
		WHERE e.`id` = OLD.`id` AND e.`user_id` = OLD.`user_id`
	)
	AND OLD.`expires_at` <= cast((julianday('now') - 2440587.5) * 86400000 as integer)
BEGIN
	SELECT RAISE(ABORT, 'scheduled_completion_expired');
END;
