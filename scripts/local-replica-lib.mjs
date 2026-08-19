import { createHash } from 'node:crypto';

export const CONTENT_TABLES = Object.freeze([
  { name: 'concepts', selectSql: 'SELECT * FROM `concepts` ORDER BY `id`;' },
  { name: 'image_collections', selectSql: 'SELECT * FROM `image_collections` ORDER BY `id`;' },
  { name: 'tags', selectSql: 'SELECT * FROM `tags` ORDER BY `id`;' },
  { name: 'cases', selectSql: 'SELECT * FROM `cases` WHERE `preview_session_id` IS NULL ORDER BY `id`;' },
  { name: 'assets', selectSql: 'SELECT * FROM `assets` WHERE `preview_session_id` IS NULL ORDER BY `id`;' },
  { name: 'question_prompts', selectSql: 'SELECT * FROM `question_prompts` WHERE `preview_session_id` IS NULL ORDER BY `id`;' },
  {
    name: 'case_concepts',
    selectSql: 'SELECT cc.* FROM `case_concepts` cc JOIN `cases` c ON c.`id` = cc.`case_id` WHERE c.`preview_session_id` IS NULL ORDER BY cc.`case_id`, cc.`concept_id`;'
  },
  {
    name: 'case_assets',
    selectSql: 'SELECT ca.* FROM `case_assets` ca JOIN `cases` c ON c.`id` = ca.`case_id` JOIN `assets` a ON a.`id` = ca.`asset_id` WHERE c.`preview_session_id` IS NULL AND a.`preview_session_id` IS NULL ORDER BY ca.`case_id`, ca.`display_order`;'
  },
  {
    name: 'stimulus_groups',
    selectSql: 'SELECT sg.* FROM `stimulus_groups` sg JOIN `cases` c ON c.`id` = sg.`case_id` WHERE c.`preview_session_id` IS NULL ORDER BY sg.`case_id`, sg.`display_order`, sg.`id`;'
  },
  {
    name: 'stimulus_group_options',
    selectSql: 'SELECT sgo.* FROM `stimulus_group_options` sgo JOIN `stimulus_groups` sg ON sg.`id` = sgo.`stimulus_group_id` JOIN `cases` c ON c.`id` = sg.`case_id` JOIN `assets` a ON a.`id` = sgo.`asset_id` WHERE c.`preview_session_id` IS NULL AND a.`preview_session_id` IS NULL ORDER BY sgo.`stimulus_group_id`, sgo.`display_order`, sgo.`id`;'
  },
  {
    name: 'concept_questions',
    selectSql: 'SELECT cq.* FROM `concept_questions` cq JOIN `question_prompts` qp ON qp.`id` = cq.`question_prompt_id` WHERE qp.`preview_session_id` IS NULL ORDER BY cq.`id`;'
  },
  {
    name: 'case_questions',
    selectSql: 'SELECT cq.* FROM `case_questions` cq JOIN `cases` c ON c.`id` = cq.`case_id` JOIN `question_prompts` qp ON qp.`id` = cq.`question_prompt_id` WHERE c.`preview_session_id` IS NULL AND qp.`preview_session_id` IS NULL ORDER BY cq.`id`;'
  },
  {
    name: 'stimulus_group_questions',
    selectSql: 'SELECT sgq.* FROM `stimulus_group_questions` sgq JOIN `stimulus_groups` sg ON sg.`id` = sgq.`stimulus_group_id` JOIN `cases` c ON c.`id` = sg.`case_id` JOIN `question_prompts` qp ON qp.`id` = sgq.`question_prompt_id` WHERE c.`preview_session_id` IS NULL AND qp.`preview_session_id` IS NULL ORDER BY sgq.`id`;'
  },
  {
    name: 'stimulus_option_questions',
    selectSql: 'SELECT soq.* FROM `stimulus_option_questions` soq JOIN `stimulus_group_options` sgo ON sgo.`id` = soq.`stimulus_group_option_id` JOIN `stimulus_groups` sg ON sg.`id` = sgo.`stimulus_group_id` JOIN `cases` c ON c.`id` = sg.`case_id` JOIN `question_prompts` qp ON qp.`id` = soq.`question_prompt_id` WHERE c.`preview_session_id` IS NULL AND qp.`preview_session_id` IS NULL ORDER BY soq.`id`;'
  },
  {
    name: 'case_tags',
    selectSql: 'SELECT ct.* FROM `case_tags` ct JOIN `cases` c ON c.`id` = ct.`case_id` WHERE c.`preview_session_id` IS NULL ORDER BY ct.`case_id`, ct.`tag_id`;'
  },
  {
    name: 'case_question_tags',
    selectSql: 'SELECT cqt.* FROM `case_question_tags` cqt JOIN `case_questions` cq ON cq.`id` = cqt.`case_question_id` JOIN `cases` c ON c.`id` = cq.`case_id` WHERE c.`preview_session_id` IS NULL ORDER BY cqt.`case_question_id`, cqt.`tag_id`;'
  },
  {
    name: 'shared_questions',
    selectSql: 'SELECT sq.* FROM `shared_questions` sq JOIN `question_prompts` qp ON qp.`id` = sq.`question_prompt_id` WHERE qp.`preview_session_id` IS NULL ORDER BY sq.`id`;'
  },
  {
    name: 'shared_question_tags',
    selectSql: 'SELECT sqt.* FROM `shared_question_tags` sqt JOIN `shared_questions` sq ON sq.`id` = sqt.`shared_question_id` JOIN `question_prompts` qp ON qp.`id` = sq.`question_prompt_id` WHERE qp.`preview_session_id` IS NULL ORDER BY sqt.`shared_question_id`, sqt.`tag_id`;'
  }
]);

export const FORBIDDEN_PRODUCTION_TABLES = Object.freeze([
  'user',
  'account',
  'session',
  'verification',
  'reviews',
  'review_questions',
  'review_assets',
  'preview_sessions',
  'import_jobs'
]);

// Child-first reset order. Local auth tables are intentionally absent so the
// developer's local administrator survives production-content refreshes.
export const LOCAL_RESET_TABLES = Object.freeze([
  'review_questions',
  'review_assets',
  'reviews',
  'shared_question_tags',
  'shared_questions',
  'case_question_tags',
  'case_tags',
  'stimulus_option_questions',
  'stimulus_group_questions',
  'case_questions',
  'concept_questions',
  'stimulus_group_options',
  'stimulus_groups',
  'case_assets',
  'case_concepts',
  'question_prompts',
  'assets',
  'cases',
  'tags',
  'image_collections',
  'concepts',
  'import_jobs',
  'preview_sessions'
]);

export function assertReplicaContract() {
  const names = CONTENT_TABLES.map((table) => table.name);
  if (new Set(names).size !== names.length) throw new Error('Local replica table allowlist contains duplicates.');

  for (const forbidden of FORBIDDEN_PRODUCTION_TABLES) {
    if (names.includes(forbidden)) {
      throw new Error(`Forbidden production table ${forbidden} must never be mirrored.`);
    }
  }

  for (const table of CONTENT_TABLES) assertReadOnlySelect(table.selectSql);
}

export function assertReadOnlySelect(sql) {
  const normalized = String(sql).trim().replace(/;$/, '').trim();
  if (!/^SELECT\b/i.test(normalized)) {
    throw new Error('Production D1 refresh permits SELECT statements only.');
  }
  if (/\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|REPLACE|UPSERT|VACUUM|PRAGMA)\b/i.test(normalized)) {
    throw new Error('Production D1 refresh query contains a prohibited mutation keyword.');
  }
  return normalized;
}

export function extractD1Rows(jsonText) {
  const parsed = JSON.parse(jsonText);
  const batches = Array.isArray(parsed) ? parsed : [parsed];
  return batches.flatMap((batch) => (Array.isArray(batch?.results) ? batch.results : []));
}

export function sqlIdentifier(value) {
  const identifier = String(value);
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) throw new Error(`Unsafe SQL identifier: ${identifier}`);
  return `\`${identifier}\``;
}

export function sqlValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Cannot serialize a non-finite number to D1 SQL.');
    return String(value);
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'string') return `'${value.replaceAll("'", "''")}'`;
  throw new Error(`Unsupported D1 value type: ${typeof value}`);
}

export function buildInsertSql(tableName, rows) {
  if (!rows.length) return `-- ${tableName}: 0 rows`;
  const table = sqlIdentifier(tableName);
  return rows
    .map((row) => {
      const columns = Object.keys(row);
      if (!columns.length) throw new Error(`Cannot serialize empty row for ${tableName}.`);
      const names = columns.map(sqlIdentifier).join(', ');
      const values = columns.map((column) => sqlValue(row[column])).join(', ');
      return `INSERT INTO ${table} (${names}) VALUES (${values});`;
    })
    .join('\n');
}

export function buildLocalResetSql() {
  return [
    '-- Generated local-only reset. Better Auth user/account/session tables are intentionally preserved.',
    ...LOCAL_RESET_TABLES.map((table) => `DELETE FROM ${sqlIdentifier(table)};`),
    ''
  ].join('\n');
}

export function buildRemoteD1QueryArgs(sql) {
  const safe = assertReadOnlySelect(sql);
  return ['d1', 'execute', 'DB', '--remote', '--command', `${safe};`, '--json'];
}

export function buildLocalD1QueryArgs(sql) {
  return ['d1', 'execute', 'DB', '--local', '--command', String(sql), '--json'];
}

export function buildLocalD1FileArgs(filePath) {
  return ['d1', 'execute', 'DB', '--local', '--file', String(filePath), '--yes'];
}

export function buildRemoteR2GetArgs(bucket, key, filePath) {
  return ['r2', 'object', 'get', `${bucket}/${key}`, '--remote', '--file', String(filePath)];
}

export function buildLocalR2PutArgs(bucket, key, filePath, mimeType) {
  return [
    'r2',
    'object',
    'put',
    `${bucket}/${key}`,
    '--local',
    '--file',
    String(filePath),
    '--content-type',
    String(mimeType || 'application/octet-stream'),
    '--force'
  ];
}

export function readR2BucketName(wranglerJsonc, binding = 'MEDIA') {
  const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`"binding"\\s*:\\s*"${escaped}"[\\s\\S]{0,500}?"bucket_name"\\s*:\\s*"([^"]+)"`).exec(
    String(wranglerJsonc)
  );
  if (!match) throw new Error(`Could not find R2 bucket_name for binding ${binding} in wrangler.jsonc.`);
  return match[1];
}

export function stagingFilenameForKey(key) {
  return createHash('sha256').update(String(key)).digest('hex');
}
