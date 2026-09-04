import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MULTI_SYSTEM_V2_GUARD_SQL = `
SELECT name, sql
FROM sqlite_master
WHERE type = 'trigger'
  AND name = 'active_reviews_content_scope_guard';
`.trim();

const REQUIRED_V2_GUARD_FRAGMENTS = [
  'active_review_invalid_scope_v2',
  '$.runScope.systems',
  '$.version',
  "'all'",
  "'routes'",
  'active_review_ineligible_scope'
];

/** @param {unknown} value @returns {{name:string,sql:string}|null} */
function findGuardRow(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGuardRow(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  const record = /** @type {Record<string, unknown>} */ (value);
  if (record.name === 'active_reviews_content_scope_guard' && typeof record.sql === 'string') {
    return { name: record.name, sql: record.sql };
  }
  for (const child of Object.values(record)) {
    const found = findGuardRow(child);
    if (found) return found;
  }
  return null;
}

/**
 * Classify a successfully-read D1 trigger result without treating an old/missing
 * guard as a transport/authentication failure. This is used before Production is
 * fenced so only a successful D1 read may decide that the one-time cutover is
 * required.
 * @param {unknown} payload
 */
export function inspectMultiSystemV2Guard(payload) {
  const row = findGuardRow(payload);
  if (!row) {
    return {
      status: /** @type {const} */ ('missing'),
      name: null,
      missingFragments: [...REQUIRED_V2_GUARD_FRAGMENTS]
    };
  }
  const missingFragments = REQUIRED_V2_GUARD_FRAGMENTS.filter((fragment) => !row.sql.includes(fragment));
  if (missingFragments.length) {
    return {
      status: /** @type {const} */ ('legacy'),
      name: row.name,
      missingFragments
    };
  }
  return {
    status: /** @type {const} */ ('v2'),
    name: row.name,
    requiredFragments: [...REQUIRED_V2_GUARD_FRAGMENTS]
  };
}

/** @param {unknown} payload */
export function assertMultiSystemV2Guard(payload) {
  const inspection = inspectMultiSystemV2Guard(payload);
  if (inspection.status === 'missing') {
    throw new Error('active_reviews_content_scope_guard is missing.');
  }
  if (inspection.status === 'legacy') {
    throw new Error(`active_reviews_content_scope_guard is not the v2 guard; missing: ${inspection.missingFragments.join(', ')}`);
  }
  return { name: inspection.name, requiredFragments: inspection.requiredFragments };
}

/** @param {{remote?:boolean}} [options] */
function readMultiSystemV2GuardPayload(options = {}) {
  const wrangler = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
  const args = [
    'd1', 'execute', 'DB', options.remote ? '--remote' : '--local',
    '--command', MULTI_SYSTEM_V2_GUARD_SQL, '--json'
  ];
  const result = spawnSync(wrangler, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler exited with ${result.status}.`);
  try {
    return JSON.parse(result.stdout);
  } catch (cause) {
    throw new Error(`Could not parse Wrangler guard-inspection JSON: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/** @param {{remote?:boolean}} [options] */
export function runMultiSystemV2GuardInspection(options = {}) {
  return inspectMultiSystemV2Guard(readMultiSystemV2GuardPayload(options));
}

/** @param {{remote?:boolean}} [options] */
export function runMultiSystemV2GuardVerification(options = {}) {
  return assertMultiSystemV2Guard(readMultiSystemV2GuardPayload(options));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const remote = process.argv.includes('--remote');
  const inspect = process.argv.includes('--inspect');
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--remote' && arg !== '--local' && arg !== '--inspect');
  if (unknown.length) {
    console.error(`Unknown argument(s): ${unknown.join(', ')}`);
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify(inspect
        ? {
            ok: true,
            target: remote ? 'remote' : 'local',
            inspection: runMultiSystemV2GuardInspection({ remote })
          }
        : {
            ok: true,
            target: remote ? 'remote' : 'local',
            guard: runMultiSystemV2GuardVerification({ remote })
          }, null, 2));
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
}
