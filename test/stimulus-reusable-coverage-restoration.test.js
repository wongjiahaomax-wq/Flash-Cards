import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { updateCase } from '../src/lib/server/db/admin-content.js';
import { createAssetQuestion, optInAssetQuestion } from '../src/lib/server/db/asset-questions.js';
import { createDb } from '../src/lib/server/db/index.js';
import {
  addStimulusOption,
  createStimulusGroup,
  getCaseStimulusCoverageRequirement,
  removeStimulusOptionFromCase,
  updateStimulusGroup
} from '../src/lib/server/db/stimulus-groups.js';

const migrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0005_tag_foundation.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0006_preview_admin_workspace.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0007_image_collections.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0008_tag_shared_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0009_reusable_image_questions.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0012_archive_stimulus_options.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0016_original_stimulus_options.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(buildSeedSql());
  const d1 = {
    /** @param {string} sql */
    prepare(sql) {
      return {
        /** @param {...any} params */
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() {
              const statement = sqlite.prepare(sql);
              statement.setReturnArrays(true);
              return statement.all(...params);
            },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            }
          };
        }
      };
    },
    /** @param {any[]} statements */
    async batch(statements) { return Promise.all(statements.map((/** @type {any} */ statement) => statement.run())); }
  };
  return { db: createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1))), sqlite };
}

test('archived restoration counts reusable image questions toward minimum coverage', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'Reusable minimum restoration',
      specificQuestionMode: 'none'
    });
    const optionId = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b');
    const reusableQuestionId = await createAssetQuestion(fixture.db, {
      assetId: 'seed-asset-anterior-b',
      promptMd: 'Reusable minimum-only question?',
      answerMd: 'Reusable answer.'
    });
    await optInAssetQuestion(fixture.db, {
      caseId: 'seed-anterior-a',
      optionId,
      assetQuestionId: reusableQuestionId
    });

    await updateStimulusGroup(fixture.db, {
      groupId,
      name: 'Reusable minimum restoration',
      specificQuestionMode: 'minimum',
      minimumSpecificQuestions: 1,
      isActive: true
    });
    assert.equal(await getCaseStimulusCoverageRequirement(fixture.db, 'seed-anterior-a'), 1);

    await removeStimulusOptionFromCase(fixture.db, optionId);
    assert.equal(await getCaseStimulusCoverageRequirement(fixture.db, 'seed-anterior-a'), 0);
    assert.equal(await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b'), optionId);
    assert.equal(await getCaseStimulusCoverageRequirement(fixture.db, 'seed-anterior-a'), 1);
  } finally {
    fixture.sqlite.close();
  }
});

test('archived restoration blocks reusable image questions that exceed a fixed all-coverage count', async () => {
  const fixture = createLearningDb();
  try {
    const groupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'Reusable all restoration',
      specificQuestionMode: 'none'
    });
    const optionId = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b');

    for (const [index, promptMd] of ['Reusable all question one?', 'Reusable all question two?'].entries()) {
      const assetQuestionId = await createAssetQuestion(fixture.db, {
        assetId: 'seed-asset-anterior-b',
        promptMd,
        answerMd: `Reusable answer ${index + 1}.`
      });
      await optInAssetQuestion(fixture.db, {
        caseId: 'seed-anterior-a',
        optionId,
        assetQuestionId
      });
    }

    await updateStimulusGroup(fixture.db, {
      groupId,
      name: 'Reusable all restoration',
      specificQuestionMode: 'all',
      isActive: true
    });
    await updateCase(fixture.db, {
      caseId: 'seed-anterior-a',
      title: 'Anterior STEMI ECG A',
      questionSelectionMode: 'fixed',
      questionCount: 2
    });
    assert.equal(await getCaseStimulusCoverageRequirement(fixture.db, 'seed-anterior-a'), 2);

    await removeStimulusOptionFromCase(fixture.db, optionId);
    assert.equal(await getCaseStimulusCoverageRequirement(fixture.db, 'seed-anterior-a'), 0);
    await updateCase(fixture.db, {
      caseId: 'seed-anterior-a',
      title: 'Anterior STEMI ECG A',
      questionSelectionMode: 'fixed',
      questionCount: 1
    });

    await assert.rejects(
      () => addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b'),
      /can require at least 2 questions/
    );
    const archived = fixture.sqlite.prepare('SELECT is_active, removed_from_case FROM stimulus_group_options WHERE id = ?').get(optionId);
    assert.deepEqual({ ...archived }, { is_active: 0, removed_from_case: 1 });
  } finally {
    fixture.sqlite.close();
  }
});
