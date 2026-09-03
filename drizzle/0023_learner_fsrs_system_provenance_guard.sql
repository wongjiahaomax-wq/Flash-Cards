CREATE TRIGGER `concepts_fsrs_system_history_kind_guard`
BEFORE UPDATE OF `kind` ON `concepts`
WHEN OLD.`kind` = 'system'
	AND NEW.`kind` <> 'system'
	AND (
		EXISTS (SELECT 1 FROM `scheduled_review_events` e WHERE e.`system_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `learner_system_aggregates` a WHERE a.`system_id` = OLD.`id`)
	)
BEGIN
	SELECT RAISE(ABORT, 'System has durable learner FSRS history and cannot be reclassified.');
END;
--> statement-breakpoint
CREATE TRIGGER `concepts_fsrs_system_history_delete_guard`
BEFORE DELETE ON `concepts`
WHEN OLD.`kind` = 'system'
	AND (
		EXISTS (SELECT 1 FROM `scheduled_review_events` e WHERE e.`system_id` = OLD.`id`)
		OR EXISTS (SELECT 1 FROM `learner_system_aggregates` a WHERE a.`system_id` = OLD.`id`)
	)
BEGIN
	SELECT RAISE(ABORT, 'System has durable learner FSRS history and cannot be deleted.');
END;
