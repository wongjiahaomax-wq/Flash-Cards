CREATE TRIGGER `learner_fsrs_profiles_active_scheduled_boundary_guard`
BEFORE UPDATE OF `generation`, `review_sequence_epoch`, `parameter_revision`, `scheduler_revision`, `scheduler_library_version`
ON `learner_fsrs_profiles`
WHEN (
	OLD.`generation` <> NEW.`generation`
	OR OLD.`review_sequence_epoch` <> NEW.`review_sequence_epoch`
	OR OLD.`parameter_revision` <> NEW.`parameter_revision`
	OR OLD.`scheduler_revision` <> NEW.`scheduler_revision`
	OR OLD.`scheduler_library_version` <> NEW.`scheduler_library_version`
) AND EXISTS (
	SELECT 1
	FROM `active_reviews` active
	WHERE active.`user_id` = OLD.`user_id`
		AND active.`study_mode` = 'scheduled'
)
BEGIN
	SELECT RAISE(ABORT, 'learner_fsrs_boundary_active_review');
END;
