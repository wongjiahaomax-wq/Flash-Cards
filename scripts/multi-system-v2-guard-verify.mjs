import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MULTI_SYSTEM_V2_GUARD_SQL = `
SELECT name, sql
FROM sqlite_master
WHERE type = 'trigger'
  AND name = 'active_reviews_content_scope_guard';
`.trim();

function findGuardRow(value) {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findGuardRow(item);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== 'object') return null;
  if (value.name === 'active_reviews_content_scope_guard' && typeof value.sql === 'string') return value;
  for (const child of Object.values(value)) {
    const found = findGuardRow(child);
    if (found) return found;
  }
  return null;
}

export function assertMultiSystemV2Guard(payload) {
  const row = findGuardRow(payload);
  if (!row) throw new Error('active_reviews_content_scope_guard is missing.');
  const requiredFragments = [
    'active_review_invalid_scope_v2',
    '$.runScope.systems',
    "$.version",
    "'all'",
    "'routes'",
    'active_review_ineligible_scope'
  ];
  const missing = requiredFragments.filter((fragment) => !row.sql.includes(fragment));
  if (missing.length) {
    throw new Error(`active_reviews_content_scope_guard is not the v2 guard; missing: ${missing.join(', ')}`);
  }
  return { name: row.name, requiredFragments };
}

export function runMultiSystemV2GuardVerification(options = {}) {
  const wrangler = join(process.cwd(), 'node_modules', '.bin', process.platform === 'win32' ? 'wrangler.cmd' : 'wrangler');
  const args = [
    'd1', 'execute', 'DB', options.remote ? '--remote' : '--local',
    '--command', MULTI_SYSTEM_V2_GUARD_SQL, '--json'
  ];
  const result = spawnSync(wrangler, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler exited with ${result.status}.`);
  return assertMultiSystemV2Guard(JSON.parse(result.stdout));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const remote = process.argv.includes('--remote');
  const unknown = process.argv.slice(2).filter((arg) => arg !== '--remote' && arg !== '--local');
  if (unknown.length) {
    console.error(`Unknown argument(s): ${unknown.join(', ')}`);
    process.exitCode = 2;
  } else {
    try {
      console.log(JSON.stringify({
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
