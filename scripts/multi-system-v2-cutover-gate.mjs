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

export const MULTI_SYSTEM_V2_ZERO_DATA_SQL = `
SELECT
${MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.map((table) => `  (SELECT COUNT(*) FROM ${table}) AS ${table}_count`).join(',\n')};
`.trim();

function findCountRow(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCountRow(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = value;
  if (MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.every((table) => `${table}_count` in record)) return record;
  for (const child of Object.values(record)) {
    const found = findCountRow(child);
    if (found) return found;
  }
  return null;
}

export function extractMultiSystemV2ZeroDataCounts(payload) {
  const row = findCountRow(payload);
  if (!row) throw new Error('Could not locate multi-System v2 zero-data counts in Wrangler JSON output.');
  return Object.fromEntries(
    MULTI_SYSTEM_V2_ZERO_DATA_SENTINELS.map((table) => [table, Number(row[`${table}_count`])])
  );
}

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

export function runMultiSystemV2ZeroDataGate(options = {}) {
  const wrangler = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
  const args = [
    'd1', 'execute', 'DB', options.remote ? '--remote' : '--local',
    '--command', MULTI_SYSTEM_V2_ZERO_DATA_SQL, '--json'
  ];
  const result = spawnSync(wrangler, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler exited with ${result.status}.`);
  return assertMultiSystemV2ZeroData(extractMultiSystemV2ZeroDataCounts(JSON.parse(result.stdout)));
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
        note: 'Read-only fail-closed multi-System v2 cutover gate; this command performs no mutation.',
        counts
      }, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
