import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const now = 1_755_206_400_000;

/** @param {string | null | undefined} value */
function sqlString(value) {
  return value == null ? 'NULL' : `'${String(value).replaceAll("'", "''")}'`;
}

/** @param {string} table @param {string[]} columns @param {(string | number | boolean | null | undefined)[]} values */
function insert(table, columns, values) {
  return `INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${values
    .map((value) => (typeof value === 'boolean' ? (value ? '1' : '0') : typeof value === 'number' ? String(value) : sqlString(value)))
    .join(', ')});`;
}

export function buildSeedSql() {
  const statements = [];
  const conceptColumns = ['id', 'name', 'slug', 'description_md', 'parent_id', 'is_active', 'created_at', 'updated_at'];
  statements.push(
    insert('concepts', conceptColumns, ['seed-stemi', 'STEMI', 'stemi', 'ST-elevation myocardial infarction patterns and management.', null, true, now, now]),
    insert('concepts', conceptColumns, ['seed-anterior-stemi', 'Anterior STEMI', 'anterior-stemi', 'Anterior territory STEMI examples.', 'seed-stemi', true, now, now]),
    insert('concepts', conceptColumns, ['seed-dermatology', 'Dermatology', 'dermatology', 'Clinical morphology and pattern recognition.', null, true, now, now]),
    insert('concepts', conceptColumns, ['seed-pityriasis-rosea', 'Pityriasis rosea', 'pityriasis-rosea', 'A multi-image dermatology example.', 'seed-dermatology', true, now, now])
  );

  const caseColumns = ['id', 'title', 'vignette_md', 'is_active', 'created_at', 'updated_at'];
  statements.push(
    insert('cases', caseColumns, ['seed-anterior-a', 'Anterior STEMI ECG A', 'Review this ECG as one clinical stimulus.', true, now, now]),
    insert('cases', caseColumns, ['seed-anterior-b', 'Anterior STEMI ECG B', 'Compare the morphology with other anterior STEMI examples.', true, now, now]),
    insert('cases', caseColumns, ['seed-anterior-c', 'Anterior STEMI ECG C', 'Look for the additional finding in this ECG.', true, now, now]),
    insert('cases', caseColumns, ['seed-pityriasis-rosea', 'Pityriasis rosea image pair', 'Interpret the two clinical photographs together.', true, now, now])
  );

  const caseConceptColumns = ['case_id', 'concept_id', 'role', 'created_at'];
  for (const id of ['seed-anterior-a', 'seed-anterior-b', 'seed-anterior-c']) {
    statements.push(insert('case_concepts', caseConceptColumns, [id, 'seed-anterior-stemi', 'primary', now]));
  }
  statements.push(insert('case_concepts', caseConceptColumns, ['seed-pityriasis-rosea', 'seed-pityriasis-rosea', 'primary', now]));

  const assetColumns = ['id', 'type', 'storage_key', 'mime_type', 'original_filename', 'alt_text', 'source_label', 'source_url', 'licence', 'is_active', 'created_at', 'updated_at'];
  const assets = [
    ['seed-asset-anterior-a', 'seed/anterior-stemi-a.png', 'Anterior STEMI ECG example A', null],
    ['seed-asset-anterior-b', 'seed/anterior-stemi-b.png', 'Anterior STEMI ECG example B', null],
    ['seed-asset-anterior-c', 'seed/anterior-stemi-c.png', 'Anterior STEMI ECG example C', null],
    ['seed-asset-pityriasis-herald', 'seed/pityriasis-rosea-herald.png', 'Pityriasis rosea herald patch', 'Original teaching image'],
    ['seed-asset-pityriasis-trunk', 'seed/pityriasis-rosea-trunk.png', 'Pityriasis rosea truncal eruption', null]
  ];
  for (const [id, storageKey, altText, sourceLabel] of assets) {
    statements.push(insert('assets', assetColumns, [id, 'image', storageKey, 'image/png', null, altText, sourceLabel, null, null, true, now, now]));
  }

  const caseAssetColumns = ['case_id', 'asset_id', 'display_order', 'caption_md', 'created_at'];
  statements.push(
    insert('case_assets', caseAssetColumns, ['seed-anterior-a', 'seed-asset-anterior-a', 0, 'ECG example A', now]),
    insert('case_assets', caseAssetColumns, ['seed-anterior-b', 'seed-asset-anterior-b', 0, 'ECG example B', now]),
    insert('case_assets', caseAssetColumns, ['seed-anterior-c', 'seed-asset-anterior-c', 0, 'ECG example C', now]),
    insert('case_assets', caseAssetColumns, ['seed-pityriasis-rosea', 'seed-asset-pityriasis-herald', 0, 'Herald patch', now]),
    insert('case_assets', caseAssetColumns, ['seed-pityriasis-rosea', 'seed-asset-pityriasis-trunk', 1, 'Later truncal eruption', now])
  );

  const promptColumns = ['id', 'prompt_md', 'is_active', 'created_at', 'updated_at'];
  const prompts = [
    ['seed-prompt-describe-ecg', 'Describe this ECG.'],
    ['seed-prompt-diagnosis', 'What is the diagnosis?'],
    ['seed-prompt-reperfusion', 'What is the preferred reperfusion strategy?'],
    ['seed-prompt-culprit', 'Which coronary artery is most likely involved?'],
    ['seed-prompt-conduction', 'What additional conduction abnormality is present?'],
    ['seed-prompt-derm-diagnosis', 'What is the diagnosis?'],
    ['seed-prompt-herald', 'What is the initial lesion shown?']
  ];
  for (const [id, prompt] of prompts) statements.push(insert('question_prompts', promptColumns, [id, prompt, true, now, now]));

  const conceptQuestionColumns = ['id', 'concept_id', 'question_prompt_id', 'answer_md', 'inherit_to_descendants', 'is_active', 'created_at', 'updated_at'];
  statements.push(
    insert('concept_questions', conceptQuestionColumns, ['seed-cq-stemi-reperfusion', 'seed-stemi', 'seed-prompt-reperfusion', 'Urgent reperfusion is required; primary PCI is preferred when it can be delivered within the appropriate timeframe.', true, true, now, now]),
    insert('concept_questions', conceptQuestionColumns, ['seed-cq-anterior-culprit', 'seed-anterior-stemi', 'seed-prompt-culprit', 'The left anterior descending (LAD) coronary artery is the likely culprit.', false, true, now, now]),
    insert('concept_questions', conceptQuestionColumns, ['seed-cq-anterior-diagnosis', 'seed-anterior-stemi', 'seed-prompt-diagnosis', 'Acute anterior ST-elevation myocardial infarction (STEMI).', false, true, now, now]),
    insert('concept_questions', conceptQuestionColumns, ['seed-cq-pityriasis-diagnosis', 'seed-pityriasis-rosea', 'seed-prompt-derm-diagnosis', 'Pityriasis rosea.', false, true, now, now])
  );

  const caseQuestionColumns = ['id', 'case_id', 'question_prompt_id', 'answer_md', 'is_active', 'created_at', 'updated_at'];
  statements.push(
    insert('case_questions', caseQuestionColumns, ['seed-caseq-anterior-a-describe', 'seed-anterior-a', 'seed-prompt-describe-ecg', 'ST elevation in V1–V4 with reciprocal inferior ST depression.', true, now, now]),
    insert('case_questions', caseQuestionColumns, ['seed-caseq-anterior-b-describe', 'seed-anterior-b', 'seed-prompt-describe-ecg', 'Hyperacute anterior T waves with subtle anterior ST elevation.', true, now, now]),
    insert('case_questions', caseQuestionColumns, ['seed-caseq-anterior-c-describe', 'seed-anterior-c', 'seed-prompt-describe-ecg', 'Extensive anterior ST elevation with associated right bundle branch block.', true, now, now]),
    insert('case_questions', caseQuestionColumns, ['seed-caseq-anterior-c-conduction', 'seed-anterior-c', 'seed-prompt-conduction', 'Right bundle branch block.', true, now, now]),
    insert('case_questions', caseQuestionColumns, ['seed-caseq-pityriasis-herald', 'seed-pityriasis-rosea', 'seed-prompt-herald', 'A herald patch.', true, now, now])
  );

  return `${statements.join('\n')}\n`;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const sql = buildSeedSql();
  if (args.has('--print')) {
    process.stdout.write(sql);
    return;
  }

  const directory = mkdtempSync(join(tmpdir(), 'flash-cards-seed-'));
  const file = join(directory, 'seed.sql');
  writeFileSync(file, sql, 'utf8');
  try {
    const scope = args.has('--remote') ? '--remote' : '--local';
    execFileSync('npx', ['wrangler', 'd1', 'execute', 'DB', scope, `--file=${file}`], { stdio: 'inherit' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) main();
