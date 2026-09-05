-- The marker is the durable write fence. Every current study writer must
-- consult it in the same SQLite transaction that accepts the mutation. The
-- deletion worker intentionally deletes rows while the fence is active, so
-- only inserts and updates are rejected here.
CREATE TRIGGER `active_reviews_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `active_reviews`
WHEN EXISTS (
	SELECT 1
	FROM `learner_study_data_deletions` d
	WHERE d.`phase` <> 'complete'
		AND d.`user_id` IN (OLD.`user_id`, NEW.`user_id`)
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `active_review_questions_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `active_review_questions`
WHEN EXISTS (
	SELECT 1
	FROM `active_reviews` a
	INNER JOIN `learner_study_data_deletions` d
		ON d.`user_id` = a.`user_id` AND d.`phase` <> 'complete'
	WHERE a.`id` = NEW.`active_review_id`
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `active_review_questions_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `active_review_questions`
WHEN EXISTS (
	SELECT 1
	FROM `active_reviews` a
	INNER JOIN `learner_study_data_deletions` d
		ON d.`user_id` = a.`user_id` AND d.`phase` <> 'complete'
	WHERE a.`id` IN (OLD.`active_review_id`, NEW.`active_review_id`)
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `active_review_assets_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `active_review_assets`
WHEN EXISTS (
	SELECT 1
	FROM `active_reviews` a
	INNER JOIN `learner_study_data_deletions` d
		ON d.`user_id` = a.`user_id` AND d.`phase` <> 'complete'
	WHERE a.`id` = NEW.`active_review_id`
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `active_review_assets_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `active_review_assets`
WHEN EXISTS (
	SELECT 1
	FROM `active_reviews` a
	INNER JOIN `learner_study_data_deletions` d
		ON d.`user_id` = a.`user_id` AND d.`phase` <> 'complete'
	WHERE a.`id` IN (OLD.`active_review_id`, NEW.`active_review_id`)
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `free_review_completion_receipts_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `free_review_completion_receipts`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id` AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `free_review_completion_receipts_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `free_review_completion_receipts`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` IN (OLD.`user_id`, NEW.`user_id`) AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `scheduled_review_events_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `scheduled_review_events`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id` AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `scheduled_review_events_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `scheduled_review_events`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` IN (OLD.`user_id`, NEW.`user_id`) AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_fsrs_profiles_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `learner_fsrs_profiles`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id` AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_fsrs_profiles_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `learner_fsrs_profiles`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` IN (OLD.`user_id`, NEW.`user_id`) AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_case_fsrs_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `learner_case_fsrs`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id` AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_case_fsrs_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `learner_case_fsrs`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` IN (OLD.`user_id`, NEW.`user_id`) AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_case_encounters_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `learner_case_encounters`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id` AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_case_encounters_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `learner_case_encounters`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` IN (OLD.`user_id`, NEW.`user_id`) AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_optimizer_evidence_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `learner_optimizer_evidence`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id` AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_optimizer_evidence_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `learner_optimizer_evidence`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` IN (OLD.`user_id`, NEW.`user_id`) AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_aggregates_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `learner_aggregates`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id` AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_aggregates_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `learner_aggregates`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` IN (OLD.`user_id`, NEW.`user_id`) AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_system_aggregates_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `learner_system_aggregates`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id` AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_system_aggregates_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `learner_system_aggregates`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` IN (OLD.`user_id`, NEW.`user_id`) AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_system_monthly_buckets_learner_study_data_deletion_insert_guard`
BEFORE INSERT ON `learner_system_monthly_buckets`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` = NEW.`user_id` AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
--> statement-breakpoint
CREATE TRIGGER `learner_system_monthly_buckets_learner_study_data_deletion_update_guard`
BEFORE UPDATE ON `learner_system_monthly_buckets`
WHEN EXISTS (
	SELECT 1 FROM `learner_study_data_deletions` d
	WHERE d.`user_id` IN (OLD.`user_id`, NEW.`user_id`) AND d.`phase` <> 'complete'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_study_data_deletion_in_progress');
END;
