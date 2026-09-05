import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS = [
  'active_reviews',
  'active_review_questions',
  'active_review_assets',
  'scheduled_review_events',
  'free_review_completion_receipts',
  'learner_case_fsrs',
  'learner_case_encounters',
  'learner_optimizer_evidence',
  'learner_aggregates',
  'learner_system_aggregates',
  'learner_system_monthly_buckets',
  'learner_fsrs_profiles',
  'reviews',
  'review_questions',
  'review_assets'
];

// Migration 0025 creates this table. The first v2 Production cutover deliberately
// runs the zero-data gate before applying pending migrations, so this one sentinel
// may be absent at that point. Missing required/core sentinels still fail closed.
export const MULTI_SYSTEM_V2_PRE_MIGRATION_OPTIONAL_SENTINELS = [
  'learner_system_monthly_buckets'
];

const OPTIONAL_PRE_MIGRATION_SENTINELS = new Set(MULTI_SYSTEM_V2_PRE_MIGRATION_OPTIONAL_SENTINELS);
const SENTINEL_SET = new Set(MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS);

export const MULTI_SYSTEM_V2_SENTINEL_SCHEMA_SQL = `
SELECT name
FROM sqlite_schema
WHERE type = 'table'
  AND name IN (${MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.map((table) => `'${table}'`).join(', ')} )
ORDER BY name;
`.trim();

/** @param {unknown} value @param {Set<string>} found */
function collectSentinelTableNames(value, found) {
  if (Array.isArray(value)) {
    for (const item of value) collectSentinelTableNames(item, found);
    return;
  }
  if (!value || typeof value !== 'object') return;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (typeof record.name === 'string' && SENTINEL_SET.has(record.name)) found.add(record.name);
  for (const child of Object.values(record)) collectSentinelTableNames(child, found);
}

/** @param {unknown} payload @returns {string[]} */
export function extractMultiSystemV2ExistingSentinelTables(payload) {
  const found = new Set();
  collectSentinelTableNames(payload, found);
  return MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.filter((table) => found.has(table));
}

/** @param {Iterable<string>} existingTables @returns {Set<string>} */
export function assertMultiSystemV2PreMigrationSchema(existingTables) {
  const existing = new Set(existingTables);
  const missingRequired = MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.filter(
    (table) => !existing.has(table) && !OPTIONAL_PRE_MIGRATION_SENTINELS.has(table)
  );
  if (missingRequired.length) {
    throw new Error(
      `Multi-System v2 cutover gate cannot verify required pre-migration table(s): ${missingRequired.join(', ')}.`
    );
  }
  return existing;
}

/** @param {Iterable<string>} existingTables */
export function buildMultiSystemV2ZeroDataSql(existingTables) {
  const existing = assertMultiSystemV2PreMigrationSchema(existingTables);
  return `
SELECT
${MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.map((table) => (
  existing.has(table)
    ? `  (SELECT COUNT(*) FROM ${table}) AS ${table}_count`
    : `  0 AS ${table}_count`
)).join(',\n')};
`.trim();
}

export const MULTI_SYSTEM_V2_ZERO_DATA_SQL = buildMultiSystemV2ZeroDataSql(
  MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS
);

/** @param {unknown} value @returns {Record<string, unknown>|null} */
function findCountRow(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCountRow(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.every((table) => `${table}_count` in record)) return record;
  for (const child of Object.values(record)) {
    const found = findCountRow(child);
    if (found) return found;
  }
  return null;
}

/** @param {unknown} payload @returns {Record<string, number>} */
export function extractMultiSystemV2ZeroDataCounts(payload) {
  const row = findCountRow(payload);
  if (!row) throw new Error('Could not locate multi-System v2 zero-data counts in Wrangler JSON output.');
  return Object.fromEntries(
    MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.map((table) => [table, Number(row[`${table}_count`])])
  );
}

/** @param {Record<string, number>} counts */
export function assertMultiSystemV2ZeroData(counts) {
  const invalid = MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.filter(
    (table) => !Number.isSafeInteger(counts[table]) || counts[table] < 0
  );
  if (invalid.length) throw new Error(`Invalid zero-data count(s): ${invalid.join(', ')}`);

  const nonzero = MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.filter((table) => counts[table] !== 0);
  if (nonzero.length) {
    throw new Error(
      `Multi-System v2 cutover gate failed: ${nonzero.map((table) => `${table}=${counts[table]}`).join(', ')}. `
      + 'The cutover requires an exactly-zero learner runtime/history baseline; learner_fsrs_profiles has no pristine-profile exception.'
    );
  }
  return counts;
}

/** @param {string} wrangler @param {string[]} args */
function runWranglerJson(wrangler, args) {
  const result = spawnSync(wrangler, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler exited with ${result.status}.`);
  return JSON.parse(result.stdout);
}

/** @param {{remote?:boolean}} [options] */
export function runMultiSystemV2ZeroDataGate(options = {}) {
  const wrangler = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
  const target = options.remote ? '--remote' : '--local';
  const schemaPayload = runWranglerJson(wrangler, [
    'd1', 'execute', 'DB', target,
    '--command', MULTI_SYSTEM_V2_SENTINEL_SCHEMA_SQL, '--json'
  ]);
  const existingTables = extractMultiSystemV2ExistingSentinelTables(schemaPayload);
  const zeroDataSql = buildMultiSystemV2ZeroDataSql(existingTables);
  const countPayload = runWranglerJson(wrangler, [
    'd1', 'execute', 'DB', target,
    '--command', zeroDataSql, '--json'
  ]);
  return assertMultiSystemV2ZeroData(extractMultiSystemV2ZeroDataCounts(countPayload));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const remote = process.argv.includes('--remote');
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--remote' && arg !== '--local');
  if (unknown.length) {
    console.error(`Unknown argument(s): ${unknown.join(', ')}`);
    process.exitCode = 2;
  } else {
    try {
      const counts = runMultiSystemV2ZeroDataGate({ remote });
      console.log(JSON.stringify({
        ok: true,
        target: remote ? 'remote' : 'local',
        note: 'Read-only fail-closed multi-System v2 cutover gate; this command performs no mutation. A missing learner_system_monthly_buckets table is treated as zero only before migration 0025 creates it.',
        counts
      }, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
