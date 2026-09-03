// Focused regression coverage for issue #105 Original / Alternative semantics.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { and, eq } from 'drizzle-orm';
import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import { moveStimulusOptionWithinCase } from '../src/lib/server/db/image-option-move.js';
import { assets, caseAssets, stimulusGroupOptions, stimulusGroups } from '../src/lib/server/db/schema.js';
import { setStimulusGroupOriginal } from '../src/lib/server/db/stimulus-originals.js';
import { convertStimulusOptionToSupporting } from '../src/lib/server/db/stimulus-role-conversion.js';
import {
  addStimulusOption,
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  removeStimulusOptionFromCase,
  setStimulusOptionActive,
  startStimulusGroupFromCaseAsset
} from '../src/lib/server/db/stimulus-groups.js';
import { getReview, startReview } from './active-review-snapshot-adapter.js';
import { applyCurrentSchema } from './current-schema.js';

const preOriginalMigrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0010_reusable_image_reactivation_guard.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql',
  '0014_review_question_pool_mode.sql',
  '0015_contextual_system_topic_tag_navigation.sql'
]
  .map((name) => readFileSync(new URL(`../drizzle/${name}`, import.meta.url), 'utf8'))
  .join('\n')
  .replaceAll('--> statement-breakpoint', '');

const originalMigrationSql = readFileSync(
  new URL('../drizzle/0016_original_stimulus_options.sql', import.meta.url),
  'utf8'
).replaceAll('--> statement-breakpoint', '');

function createD1(sqlite) {
  return {
    prepare(sql) {
      return {
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
              return {
                success: true,
                results: [],
                meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) }
              };
            }
          };
        }
      };
    },
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    }
  };
}

function createFixture({ seed = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
  if (seed) sqlite.exec(buildSeedSql());
  return { sqlite, db: createDb(createD1(sqlite)) };
}

async function buildCuratedFamily(fixture) {
  const groupId = await createStimulusGroup(fixture.db, {
    caseId: 'seed-anterior-a',
    name: 'ECG family',
    specificQuestionMode: 'none'
  });
  const originalId = await convertCaseAssetToStimulusOption(
    fixture.db,
    groupId,
    'seed-asset-anterior-a'
  );
  const alternativeId = await addStimulusOption(
    fixture.db,
    groupId,
    'seed-asset-anterior-b',
    'Alternative ECG'
  );
  return { groupId, originalId, alternativeId };
}

test('migration curates only unambiguous production families and leaves Preview and legacy multi-option families unassigned', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(preOriginalMigrationSql);
    sqlite.exec(`
      INSERT INTO preview_sessions (id, user_id, expires_at) VALUES
        ('preview-session', 'preview-user', 4102444800000);
      INSERT INTO cases (id, title, question_selection_mode, preview_session_id, is_active) VALUES
        ('case-one', 'One option', 'automatic', NULL, 1),
        ('case-many', 'Many options', 'automatic', NULL, 1),
        ('case-preview', 'Preview option', 'automatic', 'preview-session', 1);
      INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, preview_session_id, is_active) VALUES
        ('asset-one', 'image', 'one.png', 'image/png', 'one.png', 'One', NULL, 1),
        ('asset-two', 'image', 'two.png', 'image/png', 'two.png', 'Two', NULL, 1),
        ('asset-three', 'image', 'three.png', 'image/png', 'three.png', 'Three', NULL, 1),
        ('asset-preview', 'image', 'preview.png', 'image/png', 'preview.png', 'Preview', 'preview-session', 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, is_active) VALUES
        ('group-one', 'case-one', 'One', 0, 1, 'none', 1),
        ('group-many', 'case-many', 'Many', 0, 1, 'none', 1),
        ('group-preview', 'case-preview', 'Preview', 0, 1, 'none', 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active) VALUES
        ('option-one', 'group-one', 'asset-one', 0, 1),
        ('option-two', 'group-many', 'asset-two', 0, 1),
        ('option-three', 'group-many', 'asset-three', 1, 1),
        ('option-preview', 'group-preview', 'asset-preview', 0, 1);
    `);

    sqlite.exec(originalMigrationSql);

    assert.equal(
      sqlite.prepare("SELECT original_option_id FROM stimulus_groups WHERE id='group-one'").get().original_option_id,
      'option-one'
    );
    assert.equal(
      sqlite.prepare("SELECT original_option_id FROM stimulus_groups WHERE id='group-many'").get().original_option_id,
      null
    );
    assert.equal(
      sqlite.prepare("SELECT original_option_id FROM stimulus_groups WHERE id='group-preview'").get().original_option_id,
      null
    );

    sqlite.prepare("UPDATE stimulus_group_options SET is_active = 0 WHERE id='option-preview'").run();
    assert.equal(
      sqlite.prepare("SELECT is_active FROM stimulus_group_options WHERE id='option-preview'").get().is_active,
      0
    );
  } finally {
    sqlite.close();
  }
});

test('migration rejects creating a stimulus family with an arbitrary non-null Original pointer', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(preOriginalMigrationSql);
    sqlite.exec(`
      INSERT INTO cases (id, title, question_selection_mode, is_active)
      VALUES ('case-one', 'One option', 'automatic', 1);
      INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active)
      VALUES ('asset-one', 'image', 'one.png', 'image/png', 'one.png', 'One', 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, is_active)
      VALUES ('group-one', 'case-one', 'One', 0, 1, 'none', 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active)
      VALUES ('option-one', 'group-one', 'asset-one', 0, 1);
    `);
    sqlite.exec(originalMigrationSql);

    assert.throws(
      () => sqlite.prepare(`
        INSERT INTO stimulus_groups
          (id, case_id, name, display_order, selection_count, specific_question_mode, is_active, original_option_id)
        VALUES ('group-invalid', 'case-one', 'Invalid', 1, 1, 'none', 1, 'option-one')
      `).run(),
      /New stimulus families must start without an Original stimulus/
    );
  } finally {
    sqlite.close();
  }
});

test('generic sequential option insertion does not infer an Original from insert order', async () => {
  const fixture = createFixture();
  try {
    const groupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'Sequential family',
      specificQuestionMode: 'none'
    });
    await convertCaseAssetToStimulusOption(fixture.db, groupId, 'seed-asset-anterior-a');

    let group = await fixture.db
      .select({ originalOptionId: stimulusGroups.originalOptionId })
      .from(stimulusGroups)
      .where(eq(stimulusGroups.id, groupId));
    assert.equal(group[0]?.originalOptionId, null);

    await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b', 'Second sequential option');

    group = await fixture.db
      .select({ originalOptionId: stimulusGroups.originalOptionId })
      .from(stimulusGroups)
      .where(eq(stimulusGroups.id, groupId));
    assert.equal(group[0]?.originalOptionId, null);
  } finally {
    fixture.sqlite.close();
  }
});

test('starting an Alternative family from ordinary image A makes A Original and preserves Core/Expanded semantics after adding B', async () => {
  const fixture = createFixture();
  try {
    const started = await startStimulusGroupFromCaseAsset(fixture.db, {
      caseId: 'seed-anterior-a',
      assetId: 'seed-asset-anterior-a',
      name: 'Source-faithful ECG family'
    });

    const group = await fixture.db
      .select({ originalOptionId: stimulusGroups.originalOptionId })
      .from(stimulusGroups)
      .where(eq(stimulusGroups.id, started.groupId));
    assert.equal(group[0]?.originalOptionId, started.optionId);

    const originalOption = await fixture.db
      .select({ assetId: stimulusGroupOptions.assetId })
      .from(stimulusGroupOptions)
      .where(eq(stimulusGroupOptions.id, started.optionId));
    assert.equal(originalOption[0]?.assetId, 'seed-asset-anterior-a');

    const fixedOriginal = await fixture.db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(eq(caseAssets.caseId, 'seed-anterior-a'), eq(caseAssets.assetId, 'seed-asset-anterior-a')));
    assert.equal(fixedOriginal.length, 0);

    const alternativeId = await addStimulusOption(
      fixture.db,
      started.groupId,
      'seed-asset-anterior-b',
      'Alternative ECG B'
    );
    const afterInsert = await fixture.db
      .select({ originalOptionId: stimulusGroups.originalOptionId })
      .from(stimulusGroups)
      .where(eq(stimulusGroups.id, started.groupId));
    assert.equal(afterInsert[0]?.originalOptionId, started.optionId);

    const coreReviewId = await startReview({
      db: fixture.db,
      userId: 'started-family-core-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'core',
      rng: () => 0
    });
    const coreReview = await getReview(fixture.db, coreReviewId, 'started-family-core-user');
    assert.equal(coreReview?.assets[0]?.stimulusOptionId, started.optionId);
    assert.equal(coreReview?.assets[0]?.assetId, 'seed-asset-anterior-a');

    const expandedReviewId = await startReview({
      db: fixture.db,
      userId: 'started-family-expanded-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'expanded',
      rng: () => 0
    });
    const expandedReview = await getReview(fixture.db, expandedReviewId, 'started-family-expanded-user');
    assert.equal(expandedReview?.assets[0]?.stimulusOptionId, alternativeId);
    assert.equal(expandedReview?.assets[0]?.assetId, 'seed-asset-anterior-b');
  } finally {
    fixture.sqlite.close();
  }
});

test('starting an Alternative family is atomic if Original assignment fails', async () => {
  const fixture = createFixture();
  try {
    fixture.sqlite.exec(`
      CREATE TRIGGER fail_start_family_original
      BEFORE UPDATE OF original_option_id ON stimulus_groups
      WHEN NEW.name = 'Fail family'
      BEGIN
        SELECT RAISE(ABORT, 'simulated Original assignment failure');
      END;
    `);

    await assert.rejects(
      startStimulusGroupFromCaseAsset(fixture.db, {
        caseId: 'seed-anterior-a',
        assetId: 'seed-asset-anterior-a',
        name: 'Fail family'
      }),
      /simulated Original assignment failure/
    );

    assert.equal(
      fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM stimulus_groups WHERE name='Fail family'").get().count,
      0
    );
    assert.equal(
      fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM stimulus_group_options WHERE asset_id='seed-asset-anterior-a'").get().count,
      0
    );
    assert.equal(
      fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM case_assets WHERE case_id='seed-anterior-a' AND asset_id='seed-asset-anterior-a'").get().count,
      1
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('Original reassignment rejects a mismatched Case before mutating another Case', async () => {
  const fixture = createFixture();
  try {
    const groupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-b',
      name: 'Case B ECG family',
      specificQuestionMode: 'none'
    });
    const originalId = await convertCaseAssetToStimulusOption(
      fixture.db,
      groupId,
      'seed-asset-anterior-b'
    );
    const alternativeId = await addStimulusOption(
      fixture.db,
      groupId,
      'seed-asset-anterior-c',
      'Case B alternative'
    );
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-b', groupId, originalId);

    await assert.rejects(
      setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, alternativeId),
      /does not belong to this Case/
    );

    const group = await fixture.db
      .select({ originalOptionId: stimulusGroups.originalOptionId })
      .from(stimulusGroups)
      .where(eq(stimulusGroups.id, groupId));
    assert.equal(group[0]?.originalOptionId, originalId);
  } finally {
    fixture.sqlite.close();
  }
});

test('database rejects repointing an active production Original to an inactive Asset', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);

    fixture.sqlite.prepare('UPDATE assets SET is_active = 0 WHERE id = ?').run('seed-asset-anterior-c');

    assert.throws(
      () => fixture.sqlite.prepare('UPDATE stimulus_group_options SET asset_id = ? WHERE id = ?')
        .run('seed-asset-anterior-c', originalId),
      /Original stimulus must point to an active eligible production image/
    );

    assert.equal(
      fixture.sqlite.prepare('SELECT asset_id FROM stimulus_group_options WHERE id = ?').get(originalId).asset_id,
      'seed-asset-anterior-a'
    );
    assert.equal(
      fixture.sqlite.prepare('SELECT original_option_id FROM stimulus_groups WHERE id = ?').get(groupId).original_option_id,
      originalId
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('database rejects reactivating a family whose explicit Original is no longer eligible', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);

    fixture.sqlite.prepare('UPDATE stimulus_groups SET is_active = 0 WHERE id = ?').run(groupId);
    fixture.sqlite.prepare('UPDATE assets SET is_active = 0 WHERE id = ?').run('seed-asset-anterior-a');

    assert.throws(
      () => fixture.sqlite.prepare('UPDATE stimulus_groups SET is_active = 1 WHERE id = ?').run(groupId),
      /Active production stimulus families require an eligible Original stimulus/
    );

    const group = fixture.sqlite.prepare(
      'SELECT is_active, original_option_id FROM stimulus_groups WHERE id = ?'
    ).get(groupId);
    assert.equal(group.is_active, 0);
    assert.equal(group.original_option_id, originalId);
  } finally {
    fixture.sqlite.close();
  }
});

test('Core uses the curated Original and Expanded substitutes an eligible Alternative', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId, alternativeId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);

    const coreReviewId = await startReview({
      db: fixture.db,
      userId: 'original-core-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'core',
      rng: () => 0
    });
    const coreReview = await getReview(fixture.db, coreReviewId, 'original-core-user');
    assert.equal(coreReview?.assets[0]?.stimulusOptionId, originalId);
    assert.equal(coreReview?.assets[0]?.assetId, 'seed-asset-anterior-a');

    const expandedReviewId = await startReview({
      db: fixture.db,
      userId: 'original-expanded-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'expanded',
      rng: () => 0
    });
    const expandedReview = await getReview(fixture.db, expandedReviewId, 'original-expanded-user');
    assert.equal(expandedReview?.assets[0]?.stimulusOptionId, alternativeId);
    assert.equal(expandedReview?.assets[0]?.assetId, 'seed-asset-anterior-b');
  } finally {
    fixture.sqlite.close();
  }
});

test('Expanded falls back to Original when the family has no eligible Alternative', async () => {
  const fixture = createFixture();
  try {
    const groupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'Single ECG family',
      specificQuestionMode: 'none'
    });
    const originalId = await convertCaseAssetToStimulusOption(
      fixture.db,
      groupId,
      'seed-asset-anterior-a'
    );
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);

    const reviewId = await startReview({
      db: fixture.db,
      userId: 'single-original-expanded-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'expanded',
      rng: () => 0
    });
    const review = await getReview(fixture.db, reviewId, 'single-original-expanded-user');
    assert.equal(review?.assets[0]?.stimulusOptionId, originalId);
  } finally {
    fixture.sqlite.close();
  }
});

test('changing Original affects future Reviews without rewriting historical Review snapshots', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId, alternativeId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);

    const historicalId = await startReview({
      db: fixture.db,
      userId: 'historical-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'core',
      rng: () => 0
    });
    const before = await getReview(fixture.db, historicalId, 'historical-user');
    assert.equal(before?.assets[0]?.stimulusOptionId, originalId);

    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, alternativeId);

    const after = await getReview(fixture.db, historicalId, 'historical-user');
    assert.equal(after?.assets[0]?.stimulusOptionId, originalId);
    assert.equal(after?.assets[0]?.assetId, 'seed-asset-anterior-a');

    const futureId = await startReview({
      db: fixture.db,
      userId: 'future-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'core',
      rng: () => 0
    });
    const future = await getReview(fixture.db, futureId, 'future-user');
    assert.equal(future?.assets[0]?.stimulusOptionId, alternativeId);
    assert.equal(future?.assets[0]?.assetId, 'seed-asset-anterior-b');
  } finally {
    fixture.sqlite.close();
  }
});

test('wrong-Original correction promotes B before A can be deactivated or removed and preserves identities and history', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId, alternativeId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);

    fixture.sqlite.exec(`
      INSERT INTO question_prompts (id, prompt_md, is_active)
      VALUES
        ('wrong-original-exact-prompt', 'Describe this exact ECG', 1),
        ('wrong-original-reusable-prompt', 'What does this image show?', 1);
      INSERT INTO stimulus_option_questions
        (id, stimulus_group_option_id, question_prompt_id, answer_md, is_active)
      VALUES
        ('wrong-original-exact-question', '${originalId}', 'wrong-original-exact-prompt', 'Exact A answer', 1);
      INSERT INTO asset_questions
        (id, asset_id, question_prompt_id, answer_md, is_active)
      VALUES
        ('wrong-original-asset-question', 'seed-asset-anterior-a', 'wrong-original-reusable-prompt', 'Reusable A answer', 1);
      INSERT INTO stimulus_option_asset_questions
        (stimulus_group_option_id, asset_question_id)
      VALUES
        ('${originalId}', 'wrong-original-asset-question');
    `);

    const beforeIdentity = fixture.sqlite.prepare(`
      SELECT id, stimulus_group_id, asset_id, caption_md, is_active, removed_from_case
      FROM stimulus_group_options WHERE id = ?
    `).get(originalId);

    const historicalId = await startReview({
      db: fixture.db,
      userId: 'wrong-original-historical-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'core',
      rng: () => 0
    });
    const historicalBefore = await getReview(fixture.db, historicalId, 'wrong-original-historical-user');
    assert.equal(historicalBefore?.assets[0]?.stimulusOptionId, originalId);
    assert.equal(historicalBefore?.assets[0]?.assetId, 'seed-asset-anterior-a');

    await assert.rejects(
      setStimulusOptionActive(fixture.db, originalId, false),
      /Choose another Original stimulus before deactivating this image\./
    );
    await assert.rejects(
      removeStimulusOptionFromCase(fixture.db, originalId),
      /Choose another Original stimulus before removing this image from the Case\./
    );
    const rejectedState = fixture.sqlite.prepare(
      'SELECT is_active, removed_from_case FROM stimulus_group_options WHERE id = ?'
    ).get(originalId);
    assert.equal(rejectedState.is_active, 1);
    assert.equal(rejectedState.removed_from_case, 0);

    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, alternativeId);

    const futureId = await startReview({
      db: fixture.db,
      userId: 'wrong-original-future-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'core',
      rng: () => 0
    });
    const future = await getReview(fixture.db, futureId, 'wrong-original-future-user');
    assert.equal(future?.assets[0]?.stimulusOptionId, alternativeId);
    assert.equal(future?.assets[0]?.assetId, 'seed-asset-anterior-b');

    const historicalAfter = await getReview(fixture.db, historicalId, 'wrong-original-historical-user');
    assert.equal(historicalAfter?.assets[0]?.stimulusOptionId, originalId);
    assert.equal(historicalAfter?.assets[0]?.assetId, 'seed-asset-anterior-a');

    await setStimulusOptionActive(fixture.db, originalId, false);
    assert.equal(
      fixture.sqlite.prepare('SELECT is_active FROM stimulus_group_options WHERE id = ?').get(originalId).is_active,
      0
    );
    await setStimulusOptionActive(fixture.db, originalId, true);
    await removeStimulusOptionFromCase(fixture.db, originalId);

    const afterIdentity = fixture.sqlite.prepare(`
      SELECT id, stimulus_group_id, asset_id, caption_md, is_active, removed_from_case
      FROM stimulus_group_options WHERE id = ?
    `).get(originalId);
    assert.equal(afterIdentity.id, beforeIdentity.id);
    assert.equal(afterIdentity.stimulus_group_id, beforeIdentity.stimulus_group_id);
    assert.equal(afterIdentity.asset_id, beforeIdentity.asset_id);
    assert.equal(afterIdentity.caption_md, beforeIdentity.caption_md);
    assert.equal(afterIdentity.is_active, 0);
    assert.equal(afterIdentity.removed_from_case, 1);

    assert.equal(
      fixture.sqlite.prepare("SELECT original_option_id FROM stimulus_groups WHERE id = ?").get(groupId).original_option_id,
      alternativeId
    );
    const preservedAsset = fixture.sqlite.prepare(
      "SELECT id, is_active FROM assets WHERE id='seed-asset-anterior-a'"
    ).get();
    assert.equal(preservedAsset.id, 'seed-asset-anterior-a');
    assert.equal(preservedAsset.is_active, 1);
    assert.equal(
      fixture.sqlite.prepare("SELECT stimulus_group_option_id FROM stimulus_option_questions WHERE id='wrong-original-exact-question'").get().stimulus_group_option_id,
      originalId
    );
    assert.equal(
      fixture.sqlite.prepare("SELECT stimulus_group_option_id FROM stimulus_option_asset_questions WHERE asset_question_id='wrong-original-asset-question'").get().stimulus_group_option_id,
      originalId
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('the current Original cannot move to another family until another option is promoted', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId, alternativeId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);
    const targetGroupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'Target family',
      specificQuestionMode: 'none'
    });

    await assert.rejects(
      moveStimulusOptionWithinCase(fixture.db, {
        caseId: 'seed-anterior-a',
        optionId: originalId,
        targetGroupId
      }),
      /Choose another Original stimulus before moving this image to another alternative set\./
    );
    assert.equal(
      fixture.sqlite.prepare('SELECT stimulus_group_id FROM stimulus_group_options WHERE id = ?').get(originalId).stimulus_group_id,
      groupId
    );

    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, alternativeId);
    const moved = await moveStimulusOptionWithinCase(fixture.db, {
      caseId: 'seed-anterior-a',
      optionId: originalId,
      targetGroupId
    });
    assert.equal(moved.optionId, originalId);
    assert.equal(
      fixture.sqlite.prepare('SELECT stimulus_group_id FROM stimulus_group_options WHERE id = ?').get(originalId).stimulus_group_id,
      targetGroupId
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('an Alternative can move to Always shown while preserving Asset and archived option identity', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId, alternativeId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);

    const result = await convertStimulusOptionToSupporting(fixture.db, alternativeId, 'seed-anterior-a');
    assert.equal(result.assetId, 'seed-asset-anterior-b');

    const supporting = await fixture.db
      .select({ assetId: caseAssets.assetId, captionMd: caseAssets.captionMd })
      .from(caseAssets)
      .where(eq(caseAssets.caseId, 'seed-anterior-a'));
    assert.ok(supporting.some((row) => row.assetId === 'seed-asset-anterior-b' && row.captionMd === 'Alternative ECG'));

    const archived = await fixture.db
      .select({ assetId: stimulusGroupOptions.assetId, isActive: stimulusGroupOptions.isActive, removedFromCase: stimulusGroupOptions.removedFromCase })
      .from(stimulusGroupOptions)
      .where(eq(stimulusGroupOptions.id, alternativeId));
    assert.equal(archived[0]?.assetId, 'seed-asset-anterior-b');
    assert.equal(archived[0]?.isActive, false);
    assert.equal(archived[0]?.removedFromCase, true);

    const asset = await fixture.db.select({ isActive: assets.isActive }).from(assets).where(eq(assets.id, 'seed-asset-anterior-b'));
    assert.equal(asset[0]?.isActive, true);
  } finally {
    fixture.sqlite.close();
  }
});

test('role conversion batch failure rolls back both supporting and archived relationships', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId, alternativeId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);
    fixture.sqlite.exec(`
      CREATE TRIGGER fail_supporting_role_archive
      BEFORE UPDATE OF is_active, removed_from_case ON stimulus_group_options
      WHEN OLD.id = '${alternativeId}' AND NEW.removed_from_case = 1
      BEGIN
        SELECT RAISE(ABORT, 'simulated option archive failure');
      END;
    `);

    await assert.rejects(
      convertStimulusOptionToSupporting(fixture.db, alternativeId, 'seed-anterior-a'),
      /simulated option archive failure/
    );

    const supporting = await fixture.db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(
        eq(caseAssets.caseId, 'seed-anterior-a'),
        eq(caseAssets.assetId, 'seed-asset-anterior-b')
      ));
    assert.equal(supporting.length, 0);

    const option = await fixture.db
      .select({ isActive: stimulusGroupOptions.isActive, removedFromCase: stimulusGroupOptions.removedFromCase })
      .from(stimulusGroupOptions)
      .where(eq(stimulusGroupOptions.id, alternativeId));
    assert.equal(option[0]?.isActive, true);
    assert.equal(option[0]?.removedFromCase, false);
  } finally {
    fixture.sqlite.close();
  }
});

test('role conversion rejects a mismatched Case before writing either relationship', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId, alternativeId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);

    await assert.rejects(
      convertStimulusOptionToSupporting(fixture.db, alternativeId, 'different-case'),
      /does not belong to this Case/
    );

    const supporting = await fixture.db
      .select({ assetId: caseAssets.assetId })
      .from(caseAssets)
      .where(and(
        eq(caseAssets.caseId, 'seed-anterior-a'),
        eq(caseAssets.assetId, 'seed-asset-anterior-b')
      ));
    assert.equal(supporting.length, 0);

    const option = await fixture.db
      .select({ isActive: stimulusGroupOptions.isActive, removedFromCase: stimulusGroupOptions.removedFromCase })
      .from(stimulusGroupOptions)
      .where(eq(stimulusGroupOptions.id, alternativeId));
    assert.equal(option[0]?.isActive, true);
    assert.equal(option[0]?.removedFromCase, false);
  } finally {
    fixture.sqlite.close();
  }
});

test('the current Original must be replaced before it can move to Always shown', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, 'seed-anterior-a', groupId, originalId);

    await assert.rejects(
      convertStimulusOptionToSupporting(fixture.db, originalId, 'seed-anterior-a'),
      /Choose another Original stimulus before moving this image to Always shown \/ supporting\./
    );

    const group = await fixture.db.select({ originalOptionId: stimulusGroups.originalOptionId }).from(stimulusGroups).where(eq(stimulusGroups.id, groupId));
    assert.equal(group[0]?.originalOptionId, originalId);
  } finally {
    fixture.sqlite.close();
  }
});