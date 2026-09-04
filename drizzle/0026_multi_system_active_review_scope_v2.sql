DROP TRIGGER `active_reviews_content_scope_guard`;
--> statement-breakpoint
CREATE TRIGGER `active_reviews_content_scope_guard`
BEFORE INSERT ON `active_reviews`
BEGIN
	-- Strict canonical v2 shape. The top-level systemId is the frozen concrete
	-- attribution for this Review; runScope is the complete authenticated mixed
	-- selection. Unknown/contradictory fields and ambiguous duplicate Systems or
	-- routes fail closed before semantic eligibility is considered.
	SELECT (CASE WHEN (
		json_type(NEW.`scope_json`) IS NOT 'object'
		OR (SELECT count(*) FROM json_each(NEW.`scope_json`)) <> 3
		OR EXISTS (
			SELECT 1 FROM json_each(NEW.`scope_json`)
			WHERE `key` NOT IN ('version', 'systemId', 'runScope')
		)
		OR json_type(NEW.`scope_json`, '$.version') IS NOT 'integer'
		OR json_extract(NEW.`scope_json`, '$.version') <> 2
		OR json_type(NEW.`scope_json`, '$.systemId') IS NOT 'text'
		OR length(json_extract(NEW.`scope_json`, '$.systemId')) < 1
		OR length(json_extract(NEW.`scope_json`, '$.systemId')) > 128
		OR json_extract(NEW.`scope_json`, '$.systemId') <> trim(json_extract(NEW.`scope_json`, '$.systemId'))
		OR json_extract(NEW.`scope_json`, '$.systemId') <> NEW.`system_id`
		OR json_type(NEW.`scope_json`, '$.runScope') IS NOT 'object'
		OR (SELECT count(*) FROM json_each(NEW.`scope_json`, '$.runScope')) <> 1
		OR EXISTS (
			SELECT 1 FROM json_each(NEW.`scope_json`, '$.runScope')
			WHERE `key` <> 'systems'
		)
		OR json_type(NEW.`scope_json`, '$.runScope.systems') IS NOT 'array'
		OR json_array_length(NEW.`scope_json`, '$.runScope.systems') < 1
		OR json_array_length(NEW.`scope_json`, '$.runScope.systems') > 64
		OR EXISTS (
			SELECT 1
			FROM json_each(NEW.`scope_json`, '$.runScope.systems') system_scope
			WHERE json_type(system_scope.value) IS NOT 'object'
				OR json_type(system_scope.value, '$.systemId') IS NOT 'text'
				OR length(json_extract(system_scope.value, '$.systemId')) < 1
				OR length(json_extract(system_scope.value, '$.systemId')) > 128
				OR json_extract(system_scope.value, '$.systemId') <> trim(json_extract(system_scope.value, '$.systemId'))
				OR json_type(system_scope.value, '$.mode') IS NOT 'text'
				OR json_extract(system_scope.value, '$.mode') NOT IN ('all', 'routes')
				OR (
					json_extract(system_scope.value, '$.mode') = 'all'
					AND (
						(SELECT count(*) FROM json_each(system_scope.value)) <> 2
						OR EXISTS (
							SELECT 1 FROM json_each(system_scope.value)
							WHERE `key` NOT IN ('systemId', 'mode')
						)
					)
				)
				OR (
					json_extract(system_scope.value, '$.mode') = 'routes'
					AND (
						(SELECT count(*) FROM json_each(system_scope.value)) <> 3
						OR EXISTS (
							SELECT 1 FROM json_each(system_scope.value)
							WHERE `key` NOT IN ('systemId', 'mode', 'routes')
						)
						OR json_type(system_scope.value, '$.routes') IS NOT 'array'
						OR json_array_length(system_scope.value, '$.routes') < 1
						OR EXISTS (
							SELECT 1
							FROM json_each(system_scope.value, '$.routes') route
							WHERE json_type(route.value) IS NOT 'object'
								OR (SELECT count(*) FROM json_each(route.value)) <> 2
								OR EXISTS (
									SELECT 1 FROM json_each(route.value)
									WHERE `key` NOT IN ('routeType', 'routeId')
								)
								OR json_type(route.value, '$.routeType') IS NOT 'text'
								OR json_extract(route.value, '$.routeType') NOT IN ('topic', 'tag')
								OR json_type(route.value, '$.routeId') IS NOT 'text'
								OR length(json_extract(route.value, '$.routeId')) < 1
								OR length(json_extract(route.value, '$.routeId')) > 128
								OR json_extract(route.value, '$.routeId') <> trim(json_extract(route.value, '$.routeId'))
						)
						OR EXISTS (
							SELECT 1
							FROM json_each(system_scope.value, '$.routes') route
							GROUP BY json_extract(route.value, '$.routeType'), json_extract(route.value, '$.routeId')
							HAVING count(*) > 1
						)
					)
				)
		)
		OR EXISTS (
			SELECT 1
			FROM json_each(NEW.`scope_json`, '$.runScope.systems') system_scope
			GROUP BY json_extract(system_scope.value, '$.systemId')
			HAVING count(*) > 1
		)
		OR EXISTS (
			SELECT 1
			FROM json_each(NEW.`scope_json`, '$.runScope.systems') system_scope
			WHERE cast(system_scope.`key` AS integer) > 0
				AND json_extract(
					NEW.`scope_json`,
					'$.runScope.systems[' || (cast(system_scope.`key` AS integer) - 1) || '].systemId'
				) >= json_extract(system_scope.value, '$.systemId')
		)
		OR (
			SELECT coalesce(sum(
				CASE WHEN json_extract(system_scope.value, '$.mode') = 'routes'
					THEN json_array_length(system_scope.value, '$.routes')
					ELSE 0 END
			), 0)
			FROM json_each(NEW.`scope_json`, '$.runScope.systems') system_scope
		) > 512
	) THEN RAISE(ABORT, 'active_review_invalid_scope_v2') END);

	-- The attribution System must be selected in runScope and this Case must be
	-- reachable through that exact selected System sub-scope. Every route form,
	-- including curated Tags and whole-System selection, retains the existing
	-- active/non-preview Case + active Primary Topic baseline.
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
				FROM json_each(NEW.`scope_json`, '$.runScope.systems') system_scope
				WHERE json_extract(system_scope.value, '$.systemId') = NEW.`system_id`
					AND (
						(
							json_extract(system_scope.value, '$.mode') = 'all'
							AND (
								EXISTS (
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
								OR EXISTS (
									SELECT 1
									FROM `case_tags` ct
									INNER JOIN `tags` t ON t.`id` = ct.`tag_id` AND t.`is_active` = 1
									INNER JOIN `system_tags` st
										ON st.`tag_id` = ct.`tag_id` AND st.`system_concept_id` = NEW.`system_id`
									WHERE ct.`case_id` = NEW.`case_id`
								)
							)
						)
						OR (
							json_extract(system_scope.value, '$.mode') = 'routes'
							AND EXISTS (
								SELECT 1
								FROM json_each(system_scope.value, '$.routes') route
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
						)
					)
			)
	) THEN RAISE(ABORT, 'active_review_ineligible_scope') END);
END;
