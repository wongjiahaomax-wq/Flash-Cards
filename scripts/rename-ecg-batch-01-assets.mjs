#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const packageId = 'ecg-anki-batch-01-20260816';

export const renameTargets = [
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1725538821539',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1725538821539.jpg',
    oldName: 'paste-c1bb25c15c3b0c56a7e686cdbe6586670527fb49.jpg',
    newName: 'Atrial fibrillation with LVH — dyspnoea and palpitations — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746714449104',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746714449104.jpg',
    oldName: 'paste-5aca5e6f781e796cb378eaa64ba1bc88cf3dc09d.jpg',
    newName: 'Complete heart block — dizziness — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746716714971',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746716714971.jpg',
    oldName: 'paste-172d471b3cd976293acfb95d6b91018da3213b68.jpg',
    newName: 'De Winter pattern — acute chest pain — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746716714973',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746716714973.jpg',
    oldName: 'paste-d15fe72fa9910c60641268094d673e42dec15b26.jpg',
    newName: 'Hyperkalemia — weakness and breathlessness — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746716714974',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746716714974.jpg',
    oldName: 'paste-2aa6a0c1791f068cb36eaf3bc085c8ec044d07b8.jpg',
    newName: 'Torsades de pointes — diarrhoea and syncope — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746716714975',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746716714975.jpg',
    oldName: 'paste-ca341eb7341eb9e01cee06f7be62e369477d10d6.jpg',
    newName: 'Pulmonary embolism — malignancy and immobilisation — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746719822112',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746719822112.jpg',
    oldName: 'paste-69a91d7066d87a01a77fda6169ae0cfec9aa1962.jpg',
    newName: 'Wolff-Parkinson-White syndrome — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746719822126',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746719822126.jpg',
    oldName: 'paste-4d651e125c225aa099a16505660e5c95221650a4.jpg',
    newName: 'Acute pericarditis — chest pain and fever — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746719822130',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746719822130.jpg',
    oldName: 'paste-56dd9c2421281d493329ff934e3c6cdbb9fdbab6.jpg',
    newName: 'Right bundle branch block — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746797229372',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746797229372.jpg',
    oldName: 'paste-b7c7da4b727dafdca024875d8ae7c015ba4ea319.jpg',
    newName: 'Cerebral T waves — collapse with severe headache — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746797320141',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746797320141.jpg',
    oldName: 'paste-f6d7d424c3c9712f02c61372599b57a0d4531752.jpg',
    newName: 'Wellens syndrome — pain-free after chest pain — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746797967140',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746797967140.jpg',
    oldName: 'paste-5f4c801d9be2d65c463109b9084450635e4bf728.jpg',
    newName: 'Posterior MI — chest pain — ECG 01.jpg'
  },
  {
    id: 'fc-import:ecg-anki-batch-01-20260816:asset:asset-1746797967141',
    storageKey: 'teaching-images/import/ecg-anki-batch-01-20260816/asset-1746797967141.jpg',
    oldName: 'paste-98dd090255aa847c3a9751d432bfafd19f9fdd4c.jpg',
    newName: 'Hypokalemia — resistant hypertension — ECG 01.jpg'
  }
];

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

const allowedRowsSql = renameTargets
  .map(
    (target) =>
      `(id = ${sqlLiteral(target.id)} AND type = 'image' AND storage_key = ${sqlLiteral(target.storageKey)} AND original_filename IN (${sqlLiteral(target.oldName)}, ${sqlLiteral(target.newName)}))`
  )
  .join('\n    OR ');

const renameCaseSql = renameTargets
  .map((target) => `WHEN ${sqlLiteral(target.id)} THEN ${sqlLiteral(target.newName)}`)
  .join('\n    ');

// One guarded UPDATE: if any target row is missing or has unexpected identity/name
// at mutation time, the scalar COUNT guard is not 13 and zero rows are changed.
export const mutationSql = `
UPDATE assets
SET original_filename = CASE id
    ${renameCaseSql}
    ELSE original_filename
  END
WHERE id IN (
  ${idsSql}
)
  AND (
    SELECT COUNT(*)
    FROM assets
    WHERE ${allowedRowsSql}
  ) = ${renameTargets.length};
`;

/** @param {Array<Record<string, unknown>>} rows */
function rowsById(rows) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

/** @param {Array<Record<string, unknown>>} rows */
export function assertPreconditions(rows) {
  const failures = [];
  if (rows.length !== renameTargets.length) failures.push(`expected ${renameTargets.length} target Asset rows but found ${rows.length}`);
  const byId = rowsById(rows);
  for (const target of renameTargets) {
    const row = byId.get(target.id);
    if (!row) {
      failures.push(`${target.id} is missing`);
      continue;
    }
    if (row.type !== 'image') failures.push(`${target.id} is not an image Asset`);
    if (row.storage_key !== target.storageKey) failures.push(`${target.id} has an unexpected immutable storage key`);
    if (row.original_filename !== target.oldName && row.original_filename !== target.newName) {
      failures.push(`${target.id} has unexpected original_filename ${String(row.original_filename)}`);
    }
  }
  if (failures.length) {
    throw new Error(`Batch 01 Asset rename precondition failed: ${failures.join('; ')}. Stop and inspect production before applying.`);
  }
}

/** @param {Array<Record<string, unknown>>} rows */
export function assertPostconditions(rows) {
  const failures = [];
  if (rows.length !== renameTargets.length) failures.push(`expected ${renameTargets.length} target Asset rows but found ${rows.length}`);
  const byId = rowsById(rows);
  for (const target of renameTargets) {
    const row = byId.get(target.id);
    if (!row) {
      failures.push(`${target.id} is missing`);
      continue;
    }
    if (row.type !== 'image') failures.push(`${target.id} is not an image Asset`);
    if (row.storage_key !== target.storageKey) failures.push(`${target.id} storage key changed unexpectedly`);
    if (row.original_filename !== target.newName) failures.push(`${target.id} was not renamed to the intended Case-aligned name`);
  }
  if (failures.length) {
    throw new Error(`Batch 01 Asset rename postcondition failed: ${failures.join('; ')}. Stop further mutation and inspect production.`);
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
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: auth.accountId, CLOUDFLARE_API_TOKEN: auth.apiToken },
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

  execute('APPLY / GUARDED ASSET METADATA RENAME', mutationSql, auth);
  const after = resultRows(execute('POST-FLIGHT / TARGET ASSET METADATA', preflightSql, auth));
  assertPostconditions(after);
  console.log(`\nRenamed ${renameTargets.length} Batch 01 Asset metadata records and verified immutable storage keys.`);
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) main();
