CREATE INDEX `reviews_navigation_route_idx` ON `reviews` (`navigation_route_type`, `navigation_route_id`);
--> statement-breakpoint
CREATE INDEX `review_questions_source_concept_idx` ON `review_questions` (`source_concept_id`);
