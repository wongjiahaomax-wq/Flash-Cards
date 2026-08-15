import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';

const baseMigrationSql = [
  readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
  readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8')
].join('\n').replaceAll('--> statement-breakpoint', '');
const multiTopicMigrationSql = readFileSync(new URL('../drizzle/0003_multi_topic_study_routing.sql', import.meta.url), 'utf8');

test('multi-Topic migration succeeds inside a D1-like transaction with foreign keys enforced', () => {
  const sqlite = new DatabaseSync(':memory:');
  try {
    sqlite.exec('PRAGMA foreign_keys = ON');
    sqlite.exec(baseMigrationSql);
    sqlite.exec(`
      INSERT INTO concepts (id, name, slug, is_active)
      VALUES ('old-topic', 'Old Topic', 'old-topic', 1);
      INSERT INTO cases (id, title, question_selection_mode, is_active)
      VALUES ('old-case', 'Old Case', 'automatic', 1);
      INSERT INTO case_concepts (case_id, concept_id, role)
      VALUES ('old-case', 'old-topic', 'primary');
      INSERT INTO question_prompts (id, prompt_md, is_active)
      VALUES ('old-prompt', 'Old prompt', 1);
      INSERT INTO assets (id, type, storage_key, mime_type, is_active)
      VALUES ('old-asset', 'image', 'old/asset.png', 'image/png', 1);
      INSERT INTO reviews (
        id, user_id, case_id, primary_concept_id, case_title_snapshot,
        vignette_snapshot_md, status
      ) VALUES (
        'old-review', 'learner', 'old-case', 'old-topic', 'Old Case',
        'Historical vignette', 'started'
      );
      INSERT INTO review_questions (
        id, review_id, question_prompt_id, source_type, source_concept_id,
        display_order, prompt_snapshot_md, answer_snapshot_md
      ) VALUES (
        'old-rq', 'old-review', 'old-prompt', 'concept', 'old-topic',
        0, 'Old prompt', 'Old answer'
      );
      INSERT INTO review_assets (
        id, review_id, asset_id, display_order, storage_key_snapshot,
        caption_snapshot_md, alt_text_snapshot
      ) VALUES (
        'old-ra', 'old-review', 'old-asset', 0, 'old/asset.png',
        'Historical caption', 'Historical alt text'
      );
    `);

    assert.equal(sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);

    sqlite.exec('BEGIN');
    try {
      sqlite.exec(multiTopicMigrationSql);
      assert.equal(sqlite.prepare('PRAGMA foreign_keys').get()?.foreign_keys, 1);
      sqlite.exec('COMMIT');
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }

    const review = sqlite.prepare(`
      SELECT primary_concept_id, study_concept_id, case_title_snapshot, vignette_snapshot_md
      FROM reviews WHERE id = ?
    `).get('old-review');
    assert.deepEqual(
      { ...review },
      {
        primary_concept_id: 'old-topic',
        study_concept_id: 'old-topic',
        case_title_snapshot: 'Old Case',
        vignette_snapshot_md: 'Historical vignette'
      }
    );

    const question = sqlite.prepare(`
      SELECT prompt_snapshot_md, answer_snapshot_md, source_concept_id
      FROM review_questions WHERE id = ?
    `).get('old-rq');
    assert.deepEqual(
      { ...question },
      {
        prompt_snapshot_md: 'Old prompt',
        answer_snapshot_md: 'Old answer',
        source_concept_id: 'old-topic'
      }
    );

    const asset = sqlite.prepare(`
      SELECT storage_key_snapshot, caption_snapshot_md, alt_text_snapshot
      FROM review_assets WHERE id = ?
    `).get('old-ra');
    assert.deepEqual(
      { ...asset },
      {
        storage_key_snapshot: 'old/asset.png',
        caption_snapshot_md: 'Historical caption',
        alt_text_snapshot: 'Historical alt text'
      }
    );

    const questionReviewFk = sqlite
      .prepare("PRAGMA foreign_key_list('review_questions')")
      .all()
      .find((foreignKey) => foreignKey.from === 'review_id');
    const assetReviewFk = sqlite
      .prepare("PRAGMA foreign_key_list('review_assets')")
      .all()
      .find((foreignKey) => foreignKey.from === 'review_id');
    assert.equal(questionReviewFk?.table, 'reviews');
    assert.equal(assetReviewFk?.table, 'reviews');

    assert.deepEqual(sqlite.prepare('PRAGMA foreign_key_check').all(), []);
  } finally {
    sqlite.close();
  }
});
