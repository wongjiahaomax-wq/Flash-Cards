// @ts-nocheck
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import {
  SystemStudySelectionError,
  normalizeSystemStudySelectionRoutes
} from '../src/lib/server/learning/system-study-routes.ts';
import { applyCurrentSchema } from './current-schema.js';

const chooserSource = readFileSync(
  new URL('../src/lib/components/study/SystemStudyChooser.svelte', import.meta.url),
  'utf8'
);

test('Checkpoint G rejects a Tag that exists on Cases but is not curated for the selected System', () => {
  const fixture = {
    concepts: [
      { id: 'cardio', name: 'Cardiovascular', kind: 'system', parentId: null, isActive: true },
      { id: 'rhythm', name: 'Rhythm', kind: 'topic', parentId: 'cardio', isActive: true }
    ],
    caseTopicRows: [
      { id: 'case-a', title: 'Case A', isActive: true, conceptId: 'rhythm', role: 'primary' }
    ],
    caseTagRows: [
      { caseId: 'case-a', tagId: 'uncurated-tag', tagName: 'Uncurated Tag' }
    ],
    systemTagRows: []
  };

  assert.throws(
    () => normalizeSystemStudySelectionRoutes({
      ...fixture,
      systemId: 'cardio',
      routes: [{ routeType: 'tag', routeId: 'uncurated-tag' }]
    }),
    (error) => error instanceof SystemStudySelectionError && error.code === 'route-not-in-system'
  );
});

test('Checkpoint G database contract rejects a Review whose selection belongs to another System', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    applyCurrentSchema(sqlite);
    sqlite.exec(`
      INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
        ('cardio', 'Cardiovascular', 'cardio', 'system', NULL, 1),
        ('rhythm', 'Rhythm', 'rhythm', 'topic', 'cardio', 1),
        ('metabolic', 'Metabolic', 'metabolic', 'system', NULL, 1),
        ('electrolytes', 'Electrolytes', 'electrolytes', 'topic', 'metabolic', 1);
      INSERT INTO cases (id, title, question_selection_mode, is_active)
      VALUES ('case-a', 'Case A', 'all', 1);
      INSERT INTO case_concepts (case_id, concept_id, role)
      VALUES ('case-a', 'rhythm', 'primary');
      INSERT INTO study_selections (id, user_id, system_concept_id)
      VALUES ('selection-metabolic', 'learner', 'metabolic');
      INSERT INTO study_selection_routes (study_selection_id, route_type, route_id)
      VALUES ('selection-metabolic', 'topic', 'electrolytes');
    `);

    assert.throws(() => sqlite.exec(`
      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, study_concept_id,
        study_system_concept_id, route_type, study_selection_id,
        case_title_snapshot, question_pool_mode, status
      ) VALUES (
        'wrong-system-review', 'learner', 'case-a', 'rhythm', 'rhythm',
        'cardio', 'topic', 'selection-metabolic',
        'Case A', 'core', 'started'
      );
    `), /provenance is invalid/i);
  } finally {
    sqlite.close();
  }
});

test('Checkpoint G keeps responsive overflow and touch-target guardrails in the shared chooser', () => {
  assert.match(chooserSource, /min-width:\s*0/);
  assert.match(chooserSource, /overflow-wrap:\s*anywhere/);
  assert.match(chooserSource, /min-height:\s*44px/);
  assert.match(chooserSource, /@media \(max-width:\s*900px\)/);
  assert.match(chooserSource, /@media \(max-width:\s*760px\)/);
  assert.match(chooserSource, /\.start-button \{ width:\s*100%; \}/);
});
