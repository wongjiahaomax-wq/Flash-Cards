// Focused regression coverage for issue #105 Original / Alternative semantics.
// @ts-nocheck

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

import { eq } from 'drizzle-orm';
import { buildSeedSql } from '../scripts/seed-content.mjs';
import { createDb } from '../src/lib/server/db/index.js';
import { getReview, startReview } from '../src/lib/server/db/learning.js';
import { assets, caseAssets, stimulusGroupOptions, stimulusGroups } from '../src/lib/server/db/schema.js';
import { setStimulusGroupOriginal } from '../src/lib/server/db/stimulus-originals.js';
import { convertStimulusOptionToSupporting } from '../src/lib/server/db/stimulus-role-conversion.js';
import {
  addStimulusOption,
  convertCaseAssetToStimulusOption,
  createStimulusGroup
} from '../src/lib/server/db/stimulus-groups.js';

const preOriginalMigrationSql = [
  '0000_dashing_centennial.sql',
  '0002_optional_stimulus_groups.sql',
  '0003_multi_topic_study_routing.sql',
  '0005_tag_foundation.sql',
  '0006_preview_admin_workspace.sql',
  '0007_image_collections.sql',
  '0008_tag_shared_questions.sql',
  '0009_reusable_image_questions.sql',
  '0011_asset_supersession.sql',
  '0012_archive_stimulus_options.sql',
  '0013_review_assets_asset_lookup.sql',
  '0014_review_question_pool_mode.sql'
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
            async raw() { return sqlite.prepare(sql).all(...params).map((row) => Object.values(row)); },
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
      return Promise.all(statements.map((statement) => statement.run()));
    }
  };
}

function createFixture({ seed = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  sqlite.exec(preOriginalMigrationSql);
  sqlite.exec(originalMigrationSql);
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

test('migration assigns only unambiguous one-option families and leaves legacy multi-option families unassigned', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(preOriginalMigrationSql);
    sqlite.exec(`
      INSERT INTO cases (id, title, question_selection_mode, is_active) VALUES
        ('case-one', 'One option', 'automatic', 1),
        ('case-many', 'Many options', 'automatic', 1);
      INSERT INTO assets (id, type, storage_key, mime_type, original_filename, alt_text, is_active) VALUES
        ('asset-one', 'image', 'one.png', 'image/png', 'one.png', 'One', 1),
        ('asset-two', 'image', 'two.png', 'image/png', 'two.png', 'Two', 1),
        ('asset-three', 'image', 'three.png', 'image/png', 'three.png', 'Three', 1);
      INSERT INTO stimulus_groups (id, case_id, name, display_order, selection_count, specific_question_mode, is_active) VALUES
        ('group-one', 'case-one', 'One', 0, 1, 'none', 1),
        ('group-many', 'case-many', 'Many', 0, 1, 'none', 1);
      INSERT INTO stimulus_group_options (id, stimulus_group_id, asset_id, display_order, is_active) VALUES
        ('option-one', 'group-one', 'asset-one', 0, 1),
        ('option-two', 'group-many', 'asset-two', 0, 1),
        ('option-three', 'group-many', 'asset-three', 1, 1);
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
  } finally {
    sqlite.close();
  }
});

test('Core uses the curated Original and Expanded substitutes an eligible Alternative', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId, alternativeId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, groupId, originalId);

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
    await setStimulusGroupOriginal(fixture.db, groupId, originalId);

    const historicalId = await startReview({
      db: fixture.db,
      userId: 'historical-user',
      conceptId: 'seed-anterior-stemi',
      questionPoolMode: 'core',
      rng: () => 0
    });
    const before = await getReview(fixture.db, historicalId, 'historical-user');
    assert.equal(before?.assets[0]?.stimulusOptionId, originalId);

    await setStimulusGroupOriginal(fixture.db, groupId, alternativeId);

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

test('an Alternative can move to Always shown while preserving Asset and archived option identity', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId, alternativeId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, groupId, originalId);

    const result = await convertStimulusOptionToSupporting(fixture.db, alternativeId);
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

test('the current Original must be replaced before it can move to Always shown', async () => {
  const fixture = createFixture();
  try {
    const { groupId, originalId } = await buildCuratedFamily(fixture);
    await setStimulusGroupOriginal(fixture.db, groupId, originalId);

    await assert.rejects(
      convertStimulusOptionToSupporting(fixture.db, originalId),
      /Choose another Original stimulus before moving this image to Always shown \/ supporting\./
    );

    const group = await fixture.db.select({ originalOptionId: stimulusGroups.originalOptionId }).from(stimulusGroups).where(eq(stimulusGroups.id, groupId));
    assert.equal(group[0]?.originalOptionId, originalId);
  } finally {
    fixture.sqlite.close();
  }
});
