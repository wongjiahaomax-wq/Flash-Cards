#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { packageId, renameTargets } from './ecg-batch-01-asset-rename-targets.mjs';

export { packageId, renameTargets } from './ecg-batch-01-asset-rename-targets.mjs';

/** @param {unknown} value */
function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

const idsSql = renameTargets.map((target) => sqlLiteral(target.id)).join(',\n  ');

export const preflightSql = `
SELECT id, type, storage_key, original_filename
FROM assets
WHERE id IN (
  ${idsSql}
)
ORDER BY id;
`;

// Keep each write deliberately small. The first production attempt used one
// large CASE UPDATE with a correlated COUNT guard and Cloudflare D1 returned
// internal error 7500 despite a clean pre-flight. These 13 fixed statements
// avoid that query shape while preserving per-row identity/name guards.
export const mutationStatements = renameTargets.map(
  (target) => `UPDATE assets
SET original_filename = ${sqlLiteral(target.newName)}
WHERE id = ${sqlLiteral(target.id)}
  AND type = 'image'
  AND storage_key = ${sqlLiteral(target.storageKey)}
  AND original_filename IN (${sqlLiteral(target.oldName)}, ${sqlLiteral(target.newName)});`
);

// Do not add BEGIN/COMMIT here. This follows the repository's established D1
// operator pattern: Wrangler sends the fixed multi-statement command as a D1
// batch. Every statement remains independently idempotent and narrowly scoped.
export const mutationSql = mutationStatements.join('\n\n');

/** @param {Array<Record<string, unknown>>} rows */
function rowsById(rows) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

/** @param {Array<Record<string, unknown>>} rows */
export function assertPreconditions(rows) {
  const failures = [];
  if (rows.length !== renameTargets.length) {
    failures.push(`expected ${renameTargets.length} target Asset rows but found ${rows.length}`);
  }
  const byId = rowsById(rows);
  for (const target of renameTargets) {
    const row = byId.get(target.id);
    if (!row) {
      failures.push(`${target.id} is missing`);
      continue;
    }
    if (row.type !== 'image') failures.push(`${target.id} is not an image Asset`);
    if (row.storage_key !== target.storageKey) {
      failures.push(`${target.id} has an unexpected immutable storage key`);
    }
    if (row.original_filename !== target.oldName && row.original_filename !== target.newName) {
      failures.push(`${target.id} has unexpected original_filename ${String(row.original_filename)}`);
    }
  }
  if (failures.length) {
    throw new Error(
      `Batch 01 Asset rename precondition failed: ${failures.join('; ')}. Stop and inspect production before applying.`
    );
  }
}

/** @param {Array<Record<string, unknown>>} rows */
export function assertPostconditions(rows) {
  const failures = [];
  if (rows.length !== renameTargets.length) {
    failures.push(`expected ${renameTargets.length} target Asset rows but found ${rows.length}`);
  }
  const byId = rowsById(rows);
  for (const target of renameTargets) {
    const row = byId.get(target.id);
    if (!row) {
      failures.push(`${target.id} is missing`);
      continue;
    }
    if (row.type !== 'image') failures.push(`${target.id} is not an image Asset`);
    if (row.storage_key !== target.storageKey) failures.push(`${target.id} storage key changed unexpectedly`);
    if (row.original_filename !== target.newName) {
      failures.push(`${target.id} was not renamed to the intended Case-aligned name`);
    }
  }
  if (failures.length) {
    throw new Error(
      `Batch 01 Asset rename postcondition failed: ${failures.join('; ')}. Stop further mutation and inspect production.`
    );
  }
}

/** @param {unknown} payload */
function resultRows(payload) {
  if (!Array.isArray(payload) || payload.length !== 1 || !payload[0] || typeof payload[0] !== 'object') {
    throw new Error('Unexpected Wrangler JSON result shape.');
  }
  const result = /** @type {{ success?: boolean, results?: unknown[] }} */ (payload[0]);
  if (result.success !== true || !Array.isArray(result.results)) {
    throw new Error('Wrangler D1 query did not return a successful result set.');
  }
  return /** @type {Array<Record<string, unknown>>} */ (result.results);
}

/** @param {string} label @param {string} sql @param {{ accountId: string, apiToken: string }} auth */
function execute(label, sql, auth) {
  console.log(`\n== ${label} ==`);
  const output = execFileSync(
    'npx',
    ['--yes', 'wrangler@4.123.0', 'd1', 'execute', 'DB', '--remote', '--json', '--command', sql],
    {
      env: {
        ...process.env,
        CLOUDFLARE_ACCOUNT_ID: auth.accountId,
        CLOUDFLARE_API_TOKEN: auth.apiToken
      },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit']
    }
  );
  process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
  return JSON.parse(output);
}

/** @param {string[]} argv */
export function parseMode(argv) {
  const args = new Set(argv);
  const apply = args.has('--apply');
  const dryRun = args.has('--dry-run');
  if (args.size !== 1 || (!apply && !dryRun)) {
    throw new Error('Usage: node scripts/rename-ecg-batch-01-assets.mjs --dry-run|--apply');
  }
  return { apply, dryRun };
}

export function main(argv = process.argv.slice(2), env = process.env) {
  let mode;
  try {
    mode = parseMode(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
    return;
  }

  const accountId = env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = env.CLOUDFLARE_API_TOKEN;
  if (!accountId || !apiToken) {
    console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');
    process.exitCode = 2;
    return;
  }

  const auth = { accountId, apiToken };
  console.log('ECG Batch 01 Asset metadata rename operator');
  console.log(`Mode: ${mode.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log(`Scope: exactly ${renameTargets.length} deterministic Asset rows from package ${packageId}.`);
  console.log('Only assets.original_filename may change. R2 storage keys and image bytes are untouched.');
  console.log('Credential values are not printed.');

  const before = resultRows(execute('PRE-FLIGHT / TARGET ASSET METADATA', preflightSql, auth));
  assertPreconditions(before);
  console.log('Pre-flight machine safety checks passed.');
  for (const target of renameTargets) {
    const row = before.find((candidate) => candidate.id === target.id);
    console.log(`- ${String(row?.original_filename)} -> ${target.newName}`);
  }

  if (mode.dryRun) {
    console.log('\nDry run complete. No production mutation was attempted.');
    return;
  }

  execute('APPLY / 13 GUARDED ASSET METADATA UPDATES', mutationSql, auth);
  const after = resultRows(execute('POST-FLIGHT / TARGET ASSET METADATA', preflightSql, auth));
  assertPostconditions(after);
  console.log(`\nRenamed ${renameTargets.length} Batch 01 Asset metadata records and verified immutable storage keys.`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) main();
