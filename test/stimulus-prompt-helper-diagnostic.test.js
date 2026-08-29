import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { and, eq, isNull } from 'drizzle-orm';

import { createDb } from '../src/lib/server/db/index.js';
import { buildSeedSql } from '../scripts/seed-content.mjs';
import {
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroups,
  stimulusOptionQuestions
} from '../src/lib/server/db/schema.js';
import {
  addStimulusOption,
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  ensurePromptIsNotUsedByAnotherGroup,
  saveStimulusOptionQuestion
} from '../src/lib/server/db/stimulus-groups.js';

const migrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0012_archive_stimulus_options.sql',
  '0014_review_question_pool_mode.sql',
  '0016_original_stimulus_options.sql'
].map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

function fixture() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(migrationSql);
  sqlite.exec(buildSeedSql());
  const d1 = {
    prepare(sql) {
      return {
        bind(...params) {
          return {
            async all() { return { results: sqlite.prepare(sql).all(...params) }; },
            async raw() { return sqlite.prepare(sql).all(...params).map((row) => Object.values(row)); },
            async run() {
              const result = sqlite.prepare(sql).run(...params);
              return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
            }
          };
        }
      };
    },
    async batch(statements) { return Promise.all(statements.map((statement) => statement.run())); }
  };
  return { sqlite, db: createDb(/** @type {any} */ (d1)) };
}

test('diagnostic: exact Option owner query resolves one live owner', async () => {
  const { sqlite, db } = fixture();
  try {
    const sourceGroupId = await createStimulusGroup(db, { caseId: 'seed-anterior-a', name: 'Source', specificQuestionMode: 'none' });
    const sourceOptionId = await convertCaseAssetToStimulusOption(db, sourceGroupId, 'seed-asset-anterior-a');
    const targetGroupId = await createStimulusGroup(db, { caseId: 'seed-anterior-a', name: 'Target', specificQuestionMode: 'none' });
    await addStimulusOption(db, targetGroupId, 'seed-asset-anterior-b', 'Target');
    const promptId = await saveStimulusOptionQuestion(db, sourceOptionId, { promptMd: 'Diagnostic prompt owner?', answerMd: 'Source' });

    const rows = await db
      .select({
        groupId: stimulusGroups.id,
        groupIsActive: stimulusGroups.isActive,
        optionId: stimulusGroupOptions.id,
        optionIsActive: stimulusGroupOptions.isActive,
        removedFromCase: stimulusGroupOptions.removedFromCase,
        promptIsActive: questionPrompts.isActive,
        promptPreviewSessionId: questionPrompts.previewSessionId
      })
      .from(stimulusOptionQuestions)
      .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionQuestions.stimulusGroupOptionId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(questionPrompts, eq(questionPrompts.id, stimulusOptionQuestions.questionPromptId))
      .where(and(
        eq(stimulusGroups.caseId, 'seed-anterior-a'),
        eq(stimulusOptionQuestions.questionPromptId, promptId),
        eq(stimulusOptionQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId)
      ));

    assert.deepEqual(rows, [{
      groupId: sourceGroupId,
      groupIsActive: true,
      optionId: sourceOptionId,
      optionIsActive: true,
      removedFromCase: false,
      promptIsActive: true,
      promptPreviewSessionId: null
    }]);
    assert.notEqual(sourceGroupId, targetGroupId);
    await assert.rejects(
      ensurePromptIsNotUsedByAnotherGroup(db, 'seed-anterior-a', promptId, targetGroupId),
      /same Question Prompt cannot be independently attached to multiple active Stimulus Groups/
    );
  } finally {
    sqlite.close();
  }
});
