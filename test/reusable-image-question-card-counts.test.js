import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

import { buildSeedSql } from '../scripts/seed-content.mjs';
import { reusableSummaryForContext } from '../src/lib/admin-case-question-audit.js';
import {
  createAssetQuestion,
  optInAssetQuestion,
  optInFixedAssetQuestion,
  removeAssetQuestionOptIn,
  setAssetQuestionActive
} from '../src/lib/server/db/asset-questions.js';
import {
  buildCaseImageQuestionSummaries,
  listCaseImageQuestionSummaries
} from '../src/lib/server/db/case-image-question-summaries.js';
import { createDb } from '../src/lib/server/db/index.js';
import { addStimulusOption, createStimulusGroup } from '../src/lib/server/db/stimulus-groups.js';
import { applyCurrentSchema } from './current-schema.js';

/** @typedef {import('../src/lib/server/db/index.js').LearningDb} LearningDb */

const questions = [
  { id: 'aq-1', assetId: 'asset-a', promptMd: 'Q1', answerMd: 'A1' },
  { id: 'aq-2', assetId: 'asset-a', promptMd: 'Q2', answerMd: 'A2' },
  { id: 'aq-3', assetId: 'asset-a', promptMd: 'Q3', answerMd: 'A3' }
];

/**
 * @param {{ assetId: string, stimulusOptionId: string | null }} context
 * @param {{ id: string, assetId: string, promptMd: string, answerMd: string }[]} [activeQuestions]
 * @param {{ stimulusOptionId: string, assetQuestionId: string }[]} [optIns]
 */
function summary(context, activeQuestions = questions, optIns = []) {
  return buildCaseImageQuestionSummaries([context], activeQuestions, optIns)[0];
}

function createLearningDb() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys = ON');
  applyCurrentSchema(sqlite);
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
  return {
    db: /** @type {LearningDb} */ (createDb(/** @type {D1Database} */ (/** @type {unknown} */ (d1)))),
    sqlite
  };
}

/** @param {DatabaseSync} sqlite @param {string} id */
function insertProductionImage(sqlite, id) {
  sqlite.prepare('INSERT INTO assets (id, type, storage_key, mime_type, is_active) VALUES (?, ?, ?, ?, 1)')
    .run(id, 'image', `${id}.png`, 'image/png');
}

/** @param {string} relativePath */
function source(relativePath) {
  return fs.readFileSync(new URL(relativePath, import.meta.url), 'utf8');
}

/** @param {string} text @param {string} name */
function actionBlock(text, name) {
  const marker = `${name}: async`;
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `Missing action ${name}`);
  const tail = text.slice(start + marker.length);
  const next = tail.match(/\n\s{2}[A-Za-z_$][\w$]*:\s*async\b/);
  return text.slice(start, next?.index === undefined ? text.length : start + marker.length + next.index);
}

/** @param {string} text @param {string} marker */
function functionBlock(text, marker) {
  const start = text.indexOf(marker);
  assert.notEqual(start, -1, `Missing ${marker}`);
  const end = text.indexOf('\n\n  /**', start + marker.length);
  return text.slice(start, end === -1 ? text.length : end);
}

/** @param {string} text @param {string} action */
function formsForAction(text, action) {
  const marker = `action="${action}"`;
  const forms = [];
  let cursor = 0;
  while (cursor < text.length) {
    const markerIndex = text.indexOf(marker, cursor);
    if (markerIndex === -1) break;
    const start = text.lastIndexOf('<form', markerIndex);
    const end = text.indexOf('</form>', markerIndex);
    assert.ok(start >= 0 && end > markerIndex, `Could not isolate form ${action}`);
    forms.push({ text: text.slice(start, end + '</form>'.length), index: markerIndex });
    cursor = end + '</form>'.length;
  }
  assert.ok(forms.length > 0, `Missing form action ${action}`);
  return forms;
}

/** @param {string} text @param {number} index */
function activeIfConditionsAt(text, index) {
  /** @type {(string | null)[]} */
  const stack = [];
  const token = /\{#if\s+([^}]+)\}|\{:else if\s+([^}]+)\}|\{:else\}|\{\/if\}/g;
  let match;
  while ((match = token.exec(text)) && match.index < index) {
    if (match[1]) stack.push(match[1].trim());
    else if (match[2]) {
      assert.ok(stack.length > 0, 'Encountered {:else if} without an active {#if}.');
      stack[stack.length - 1] = match[2].trim();
    } else if (match[0] === '{:else}') {
      assert.ok(stack.length > 0, 'Encountered {:else} without an active {#if}.');
      stack[stack.length - 1] = null;
    } else {
      stack.pop();
    }
  }
  return stack.filter((condition) => condition !== null);
}

/** @param {string} text @param {string} action @param {string[]} fields */
function assertProductionOnlyForm(text, action, fields) {
  const forms = formsForAction(text, action);
  for (const form of forms) {
    for (const field of fields) assert.match(form.text, new RegExp(`name=["']${field}["']`));
    assert.match(form.text, /<button\b[^>]*\btype="submit"/);
    assert.ok(
      activeIfConditionsAt(text, form.index).some((condition) => condition.includes('!previewMode')),
      `${action} must remain production-only`
    );
  }
}

/** @param {string} text @param {string} name */
function tags(text, name) {
  const found = [];
  const needle = `<${name}`;
  let cursor = 0;
  while (cursor < text.length) {
    const start = text.indexOf(needle, cursor);
    if (start < 0) break;
    const boundary = text[start + needle.length];
    if (boundary && !/[\s/>]/.test(boundary)) {
      cursor = start + needle.length;
      continue;
    }

    let quote = null;
    let braceDepth = 0;
    let end = start + needle.length;
    for (; end < text.length; end += 1) {
      const char = text[end];
      if (quote) {
        if (char === quote && text[end - 1] !== '\\') quote = null;
        continue;
      }
      if (char === '"' || char === "'" || char === '`') {
        quote = char;
        continue;
      }
      if (char === '{') {
        braceDepth += 1;
        continue;
      }
      if (char === '}') {
        braceDepth = Math.max(0, braceDepth - 1);
        continue;
      }
      if (char === '>' && braceDepth === 0) break;
    }
    assert.ok(end < text.length, `Unclosed <${name}> tag.`);
    found.push(text.slice(start, end + 1));
    cursor = end + 1;
  }
  return found;
}

/** @param {string} tag @param {string} name */
function attribute(tag, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const quoted = new RegExp(`\\b${escapedName}\\s*=\\s*(['"])(.*?)\\1`, 's').exec(tag);
  if (quoted) return quoted[2];
  const startMatch = new RegExp(`\\b${escapedName}\\s*=\\s*\\{`).exec(tag);
  if (!startMatch) return null;
  const openBrace = startMatch.index + startMatch[0].lastIndexOf('{');
  let quote = null;
  let depth = 1;
  for (let cursor = openBrace + 1; cursor < tag.length; cursor += 1) {
    const char = tag[cursor];
    if (quote) {
      if (char === quote && tag[cursor - 1] !== '\\') quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return tag.slice(openBrace + 1, cursor).trim();
    }
  }
  return null;
}

/** @param {string} text @param {string} opening @param {string} name */
function elementBody(text, opening, name) {
  const start = text.indexOf(opening);
  assert.ok(start >= 0, `Missing <${name}> opening tag.`);
  const end = text.indexOf(`</${name}>`, start + opening.length);
  assert.ok(end >= 0, `Missing </${name}> closing tag.`);
  return text.slice(start + opening.length, end);
}

/** @param {string} text @param {string} component */
function componentTags(text, component) {
  return tags(text, component);
}

/** @param {string} text @param {string} variable */
function derivedExpression(text, variable) {
  const match = text.match(new RegExp(`let\\s+${variable}\\s*=\\s*\\$derived\\(([^;]+)\\);`));
  assert.ok(match, `Missing derived expression ${variable}`);
  return match[1];
}

test('fixed image shows active reusable questions as available with no used opt-ins', () => {
  const result = summary({ assetId: 'asset-a', stimulusOptionId: null });
  assert.deepEqual({ total: result.total, used: result.used, available: result.available }, { total: 3, used: 0, available: 3 });
});

test('alternative option distinguishes used and available reusable questions', () => {
  const result = summary(
    { assetId: 'asset-a', stimulusOptionId: 'option-a' },
    questions,
    [{ stimulusOptionId: 'option-a', assetQuestionId: 'aq-1' }]
  );
  assert.deepEqual({ total: result.total, used: result.used, available: result.available }, { total: 3, used: 1, available: 2 });
  assert.equal(result.questions.find((question) => question.id === 'aq-1')?.usedInCase, true);
});

test('asset with zero active reusable questions reports zero counts', () => {
  const result = summary({ assetId: 'asset-empty', stimulusOptionId: 'option-empty' }, questions, []);
  assert.deepEqual({ total: result.total, used: result.used, available: result.available }, { total: 0, used: 0, available: 0 });
});

test('removing an opt-in changes used to available without changing canonical questions', () => {
  const context = { assetId: 'asset-a', stimulusOptionId: 'option-a' };
  const before = summary(context, questions, [{ stimulusOptionId: 'option-a', assetQuestionId: 'aq-1' }]);
  const after = summary(context, questions, []);
  assert.deepEqual({ total: before.total, used: before.used, available: before.available }, { total: 3, used: 1, available: 2 });
  assert.deepEqual({ total: after.total, used: after.used, available: after.available }, { total: 3, used: 0, available: 3 });
  assert.deepEqual(after.questions.map((question) => question.id), questions.map((question) => question.id));
});

test('archive and reactivation preserve dormant opt-in semantics', () => {
  const context = { assetId: 'asset-a', stimulusOptionId: 'option-a' };
  const dormantOptIn = [{ stimulusOptionId: 'option-a', assetQuestionId: 'aq-1' }];
  const archived = summary(context, questions.filter((question) => question.id !== 'aq-1'), dormantOptIn);
  const reactivated = summary(context, questions, dormantOptIn);
  assert.deepEqual({ total: archived.total, used: archived.used, available: archived.available }, { total: 2, used: 0, available: 2 });
  assert.deepEqual({ total: reactivated.total, used: reactivated.used, available: reactivated.available }, { total: 3, used: 1, available: 2 });
});

test('production reusable-question loader filters inactive content and preserves stable creation ordering', async () => {
  const fixture = createLearningDb();
  try {
    const assetId = 'reusable-loader-asset';
    insertProductionImage(fixture.sqlite, assetId);
    const later = await createAssetQuestion(fixture.db, { assetId, promptMd: 'Later visible?', answerMd: 'Later.' });
    const tiedA = await createAssetQuestion(fixture.db, { assetId, promptMd: 'Tied visible A?', answerMd: 'A.' });
    const tiedB = await createAssetQuestion(fixture.db, { assetId, promptMd: 'Tied visible B?', answerMd: 'B.' });
    const inactiveQuestion = await createAssetQuestion(fixture.db, { assetId, promptMd: 'Inactive reusable?', answerMd: 'Hidden.' });
    const inactivePromptQuestion = await createAssetQuestion(fixture.db, { assetId, promptMd: 'Inactive prompt?', answerMd: 'Hidden too.' });

    const setCreatedAt = fixture.sqlite.prepare('UPDATE asset_questions SET created_at = ? WHERE id = ?');
    setCreatedAt.run(2000, later);
    setCreatedAt.run(1000, tiedA);
    setCreatedAt.run(1000, tiedB);
    setCreatedAt.run(500, inactiveQuestion);
    setCreatedAt.run(750, inactivePromptQuestion);
    await setAssetQuestionActive(fixture.db, { assetQuestionId: inactiveQuestion, isActive: false });
    const inactivePrompt = fixture.sqlite.prepare('SELECT question_prompt_id FROM asset_questions WHERE id = ?').get(inactivePromptQuestion);
    assert.ok(inactivePrompt);
    fixture.sqlite.prepare('UPDATE question_prompts SET is_active = 0 WHERE id = ?').run(inactivePrompt.question_prompt_id);

    const rows = await listCaseImageQuestionSummaries(fixture.db, [{ assetId, stimulusOptionId: null }]);
    assert.equal(rows.length, 1);
    const tied = [tiedA, tiedB].sort();
    assert.deepEqual(rows[0].questions.map((question) => question.id), [...tied, later]);
    assert.deepEqual({ total: rows[0].total, used: rows[0].used, available: rows[0].available }, { total: 3, used: 0, available: 3 });
  } finally {
    fixture.sqlite.close();
  }
});

test('reusable Asset Questions remain production-owned even when Preview content has matching wording', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec("INSERT INTO preview_sessions (id, user_id, status, expires_at) VALUES ('preview-reusable', 'preview-user', 'active', 4102444800000)");
    fixture.sqlite.exec("INSERT INTO assets (id, type, storage_key, mime_type, preview_session_id, is_active) VALUES ('preview-reusable-asset', 'image', 'preview-reusable.png', 'image/png', 'preview-reusable', 1)");
    await assert.rejects(
      () => createAssetQuestion(fixture.db, { assetId: 'preview-reusable-asset', promptMd: 'Preview question?', answerMd: 'Preview.' }),
      /production image Asset/
    );

    insertProductionImage(fixture.sqlite, 'production-reusable-asset');
    fixture.sqlite.exec("INSERT INTO question_prompts (id, prompt_md, preview_session_id, is_active) VALUES ('preview-matching-prompt', 'Same visible wording?', 'preview-reusable', 1)");
    const questionId = await createAssetQuestion(fixture.db, {
      assetId: 'production-reusable-asset',
      promptMd: 'Same visible wording?',
      answerMd: 'Production canonical answer.'
    });
    const prompt = fixture.sqlite.prepare(`
      SELECT qp.preview_session_id, aq.question_prompt_id
      FROM asset_questions aq
      JOIN question_prompts qp ON qp.id = aq.question_prompt_id
      WHERE aq.id = ?
    `).get(questionId);
    assert.ok(prompt);
    assert.equal(prompt.preview_session_id, null);
    const matchingPrompts = fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM question_prompts WHERE prompt_md = 'Same visible wording?'").get();
    assert.equal(Number(matchingPrompts?.count ?? 0), 2);

    const insertRawQuestion = fixture.sqlite.prepare(`
      INSERT INTO asset_questions (id, asset_id, question_prompt_id, answer_md, is_active)
      VALUES (?, ?, ?, ?, 1)
    `);
    assert.throws(
      () => insertRawQuestion.run('preview-asset-backed-question', 'preview-reusable-asset', prompt.question_prompt_id, 'Blocked.'),
      /Preview content cannot back reusable Asset Questions/
    );
    assert.throws(
      () => insertRawQuestion.run('preview-prompt-backed-question', 'production-reusable-asset', 'preview-matching-prompt', 'Blocked.'),
      /Preview content cannot back reusable Asset Questions/
    );
  } finally {
    fixture.sqlite.close();
  }
});

test('option reuse enforces Case and exact-Asset identity, and removal deletes only the validated opt-in', async () => {
  const fixture = createLearningDb();
  try {
    fixture.sqlite.exec("INSERT INTO cases (id, title, is_active) VALUES ('other-production-case', 'Other production Case', 1)");
    const groupId = await createStimulusGroup(fixture.db, {
      caseId: 'seed-anterior-a',
      name: 'Reusable exact Asset',
      specificQuestionMode: 'none'
    });
    const optionId = await addStimulusOption(fixture.db, groupId, 'seed-asset-anterior-b');
    const matchingQuestionId = await createAssetQuestion(fixture.db, {
      assetId: 'seed-asset-anterior-b',
      promptMd: 'Exact reusable prompt?',
      answerMd: 'Exact reusable answer.'
    });
    const wrongAssetQuestionId = await createAssetQuestion(fixture.db, {
      assetId: 'seed-asset-anterior-c',
      promptMd: 'Wrong reusable Asset?',
      answerMd: 'Wrong Asset.'
    });

    await assert.rejects(
      () => optInAssetQuestion(fixture.db, { caseId: 'other-production-case', optionId, assetQuestionId: matchingQuestionId }),
      /active production image from this Case/
    );
    await assert.rejects(
      () => optInAssetQuestion(fixture.db, { caseId: 'seed-anterior-a', optionId, assetQuestionId: wrongAssetQuestionId }),
      /different Asset/
    );
    assert.throws(
      () => fixture.sqlite.prepare(`
        INSERT INTO stimulus_option_asset_questions (stimulus_group_option_id, asset_question_id)
        VALUES (?, ?)
      `).run(optionId, wrongAssetQuestionId),
      /Reusable Asset Question must match the stimulus option Asset/
    );
    await optInAssetQuestion(fixture.db, { caseId: 'seed-anterior-a', optionId, assetQuestionId: matchingQuestionId });

    const usageCount = () => Number(fixture.sqlite.prepare(`
      SELECT COUNT(*) AS count FROM stimulus_option_asset_questions
      WHERE stimulus_group_option_id = ? AND asset_question_id = ?
    `).get(optionId, matchingQuestionId)?.count ?? 0);
    assert.equal(usageCount(), 1);

    await assert.rejects(
      () => removeAssetQuestionOptIn(fixture.db, { caseId: 'other-production-case', optionId, assetQuestionId: matchingQuestionId }),
      /does not belong to this Case/
    );
    await assert.rejects(
      () => removeAssetQuestionOptIn(fixture.db, { caseId: 'seed-anterior-a', optionId, assetQuestionId: wrongAssetQuestionId }),
      /does not belong to this stimulus Asset/
    );
    assert.equal(usageCount(), 1);

    await removeAssetQuestionOptIn(fixture.db, { caseId: 'seed-anterior-a', optionId, assetQuestionId: matchingQuestionId });
    assert.equal(usageCount(), 0);
  } finally {
    fixture.sqlite.close();
  }
});

test('fixed-image reuse preflights exact Asset identity and converts atomically to an explicit Original', async () => {
  const fixture = createLearningDb();
  try {
    const fixedBefore = fixture.sqlite.prepare("SELECT caption_md FROM case_assets WHERE case_id = 'seed-anterior-a' AND asset_id = 'seed-asset-anterior-a'").get();
    assert.ok(fixedBefore);
    const groupsBefore = Number(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM stimulus_groups WHERE case_id = 'seed-anterior-a'").get()?.count ?? 0);
    const wrongQuestionId = await createAssetQuestion(fixture.db, {
      assetId: 'seed-asset-anterior-b',
      promptMd: 'Wrong fixed Asset reusable?',
      answerMd: 'Wrong fixed Asset.'
    });
    await assert.rejects(
      () => optInFixedAssetQuestion(fixture.db, { caseId: 'seed-anterior-a', assetId: 'seed-asset-anterior-a', assetQuestionId: wrongQuestionId }),
      /does not belong to this fixed Asset/
    );
    assert.ok(fixture.sqlite.prepare("SELECT 1 FROM case_assets WHERE case_id = 'seed-anterior-a' AND asset_id = 'seed-asset-anterior-a'").get());
    assert.equal(Number(fixture.sqlite.prepare("SELECT COUNT(*) AS count FROM stimulus_groups WHERE case_id = 'seed-anterior-a'").get()?.count ?? 0), groupsBefore);

    const matchingQuestionId = await createAssetQuestion(fixture.db, {
      assetId: 'seed-asset-anterior-a',
      promptMd: 'Fixed exact reusable?',
      answerMd: 'Fixed exact answer.'
    });
    await optInFixedAssetQuestion(fixture.db, {
      caseId: 'seed-anterior-a',
      assetId: 'seed-asset-anterior-a',
      assetQuestionId: matchingQuestionId
    });

    assert.equal(fixture.sqlite.prepare("SELECT 1 FROM case_assets WHERE case_id = 'seed-anterior-a' AND asset_id = 'seed-asset-anterior-a'").get(), undefined);
    const converted = fixture.sqlite.prepare(`
      SELECT sg.id AS group_id, sg.original_option_id, sgo.id AS option_id, sgo.caption_md
      FROM stimulus_groups sg
      JOIN stimulus_group_options sgo ON sgo.stimulus_group_id = sg.id
      WHERE sg.case_id = ? AND sgo.asset_id = ? AND sgo.is_active = 1 AND sgo.removed_from_case = 0
    `).all('seed-anterior-a', 'seed-asset-anterior-a');
    assert.equal(converted.length, 1);
    assert.equal(converted[0].original_option_id, converted[0].option_id);
    assert.equal(converted[0].caption_md, fixedBefore.caption_md);
    const optIn = fixture.sqlite.prepare(`
      SELECT 1 FROM stimulus_option_asset_questions
      WHERE stimulus_group_option_id = ? AND asset_question_id = ?
    `).get(converted[0].option_id, matchingQuestionId);
    assert.ok(optIn);
  } finally {
    fixture.sqlite.close();
  }
});

test('production reusable controls serialize exact context and Preview exposes no matching mutation actions', () => {
  const manager = source('../src/lib/components/ReusableImageQuestionManager.svelte');
  const productionRoute = source('../src/routes/admin/cases/[caseId]/+page.server.js');
  const previewRoute = source('../src/routes/preview-admin/cases/[caseId]/+page.server.js');

  assertProductionOnlyForm(manager, '?/reuseAssetQuestion', ['case_id', 'asset_id', 'option_id', 'asset_question_id']);
  assertProductionOnlyForm(manager, '?/removeAssetQuestionReuse', ['case_id', 'option_id', 'asset_question_id']);
  assertProductionOnlyForm(manager, '?/createReusableImageQuestion', ['case_id', 'asset_id', 'prompt_md', 'answer_md']);
  assertProductionOnlyForm(manager, '?/saveReusableImageAnswer', ['case_id', 'asset_question_id', 'answer_md']);
  assert.match(manager, /Used in this Case\s*·\s*\{usedQuestions\.length\}/);
  assert.match(manager, /Available to reuse\s*·\s*\{availableQuestions\.length\}/);

  const create = actionBlock(productionRoute, 'createReusableImageQuestion');
  assert.match(create, /caseId !== params\.caseId/);
  assert.match(create, /await createAssetQuestion\(createDb\(platform\.env\.DB\), \{ assetId: formText\(formData, 'asset_id'\), promptMd: formText\(formData, 'prompt_md'\), answerMd: formText\(formData, 'answer_md'\) \}\)/);
  assert.match(create, /#images/);

  const save = actionBlock(productionRoute, 'saveReusableImageAnswer');
  assert.match(save, /caseId !== params\.caseId/);
  assert.match(save, /await updateAssetQuestionAnswer\(createDb\(platform\.env\.DB\), \{ assetQuestionId: formText\(formData, 'asset_question_id'\), answerMd: formText\(formData, 'answer_md'\) \}\)/);
  assert.match(save, /#images/);

  const reuse = actionBlock(productionRoute, 'reuseAssetQuestion');
  assert.match(reuse, /caseId !== params\.caseId/);
  assert.match(reuse, /const optionId = formText\(formData, 'option_id'\)/);
  assert.match(reuse, /if \(optionId\) await optInAssetQuestion\(db, \{ caseId, optionId, assetQuestionId: formText\(formData, 'asset_question_id'\) \}\)/);
  assert.match(reuse, /else await optInFixedAssetQuestion\(db, \{ caseId, assetId: formText\(formData, 'asset_id'\), assetQuestionId: formText\(formData, 'asset_question_id'\) \}\)/);
  assert.match(reuse, /#images/);

  const remove = actionBlock(productionRoute, 'removeAssetQuestionReuse');
  assert.match(remove, /caseId !== params\.caseId/);
  assert.match(remove, /await removeAssetQuestionOptIn\([^;]*caseId[^;]*optionId: formText\(formData, 'option_id'\)[^;]*assetQuestionId: formText\(formData, 'asset_question_id'\)/);
  assert.match(remove, /#images/);

  for (const action of ['createReusableImageQuestion', 'saveReusableImageAnswer', 'reuseAssetQuestion', 'removeAssetQuestionReuse']) {
    assert.doesNotMatch(previewRoute, new RegExp(`\\b${action}\\s*:\\s*async\\b`));
  }
});

test('Case image cards keep Case-specific and reusable ownership distinct while Manage questions reaches the exact option editor', () => {
  const images = source('../src/lib/components/case-editor/CaseImagesAdvanced.svelte');
  const counts = source('../src/lib/components/ImageQuestionCounts.svelte');
  const managerTags = componentTags(images, 'ReusableImageQuestionManager');
  assert.equal(managerTags.length, 2, managerTags.join('\n'));
  const fixedManager = managerTags.find((tag) => tag.includes('assetId={asset.assetId}'));
  const optionManager = managerTags.find((tag) => tag.includes('assetId={option.assetId}'));
  assert.ok(fixedManager);
  assert.ok(optionManager);
  assert.equal(fixedManager.includes('optionId='), false);
  assert.match(optionManager, /optionId=\{option\.id\}/);
  assert.match(fixedManager, /previewMode=\{previewMode\}/);
  assert.match(optionManager, /previewMode=\{previewMode\}/);

  const manageButtons = tags(images, 'button').filter((opening) => {
    const body = elementBody(images, opening, 'button');
    return body.includes("'Manage questions'") && body.includes("'Close questions'");
  });
  assert.equal(manageButtons.length, 1, 'Expected one visible option-card Manage questions control.');
  const manageButton = manageButtons[0];
  assert.equal(attribute(manageButton, 'type'), 'button');
  assert.equal(attribute(manageButton, 'aria-controls'), '`option-editor-${option.id}`');
  assert.equal(attribute(manageButton, 'onclick'), '() => selectOption(option.id)');
  assert.equal(attribute(manageButton, 'aria-expanded'), 'selectedOptionId === option.id');

  assert.match(images, /<section id=\{`option-editor-\$\{option\.id\}`\}[^>]*tabindex="-1"/);
  const select = functionBlock(images, 'async function selectOption(optionId)');
  assert.match(select, /await tick\(\)/);
  assert.match(select, /document\.getElementById\(`option-editor-\$\{optionId\}`\)/);
  assert.match(select, /scrollIntoView\(/);
  assert.match(select, /\.focus\(/);

  assert.match(counts, /Case-specific Image Questions\s*·\s*\{caseSpecificCount\}/);
  assert.match(counts, /Reusable Image Questions\s*·\s*\{reusableTotal\}/);
  const caseSpecificLoop = counts.slice(counts.indexOf('{#each caseSpecificQuestions'), counts.indexOf('{/each}', counts.indexOf('{#each caseSpecificQuestions')));
  assert.match(caseSpecificLoop, /question\.promptMd/);
  assert.match(caseSpecificLoop, /question\.answerMd/);
});

test('Compact review derives current participation from Family, option, and Asset live state', () => {
  const review = source('../src/lib/components/ImageQuestionReview.svelte');
  const inactiveSetSummary = reusableSummaryForContext(
    {
      stimulusGroups: [{ id: 'group-a', isActive: false, options: [{ id: 'option-a' }] }],
      reusableImageQuestions: [{ assetId: 'asset-a', stimulusOptionId: 'option-a', total: 0, used: 0, available: 0, questions: [] }]
    },
    'asset-a',
    'option-a'
  );
  assert.equal(inactiveSetSummary.groupActive, false);

  const effectiveExpression = derivedExpression(review, 'effectiveGroupActive');
  const evaluateEffective = Function('groupActive', 'reusable', `return (${effectiveExpression});`);
  assert.equal(evaluateEffective(false, { groupActive: true }), false);
  assert.equal(evaluateEffective(undefined, { groupActive: false }), false);
  assert.equal(evaluateEffective(undefined, undefined), true);

  const participantExpression = derivedExpression(review, 'currentParticipant');
  const evaluateParticipant = Function('effectiveGroupActive', 'asset', `return (${participantExpression});`);
  assert.equal(evaluateParticipant(true, { isActive: true, assetIsActive: true }), true);
  assert.equal(evaluateParticipant(false, { isActive: true, assetIsActive: true }), false);
  assert.equal(evaluateParticipant(true, { isActive: false, assetIsActive: true }), false);
  assert.equal(evaluateParticipant(true, { isActive: true, assetIsActive: false }), false);

  assert.match(review, /class:inactive-review=\{!currentParticipant\}/);
  assert.match(review, /\{currentParticipant \? '' : 'INACTIVE · '\}/);
  assert.match(review, /excluded from the current learner-participating Case audit/);
});
