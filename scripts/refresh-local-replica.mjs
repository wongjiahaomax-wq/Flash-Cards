import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  CONTENT_TABLES,
  FORBIDDEN_PRODUCTION_TABLES,
  assertReplicaContract,
  buildInsertSql,
  buildLocalD1FileArgs,
  buildLocalD1QueryArgs,
  buildLocalResetSql,
  buildLocalR2PutArgs,
  buildRemoteD1QueryArgs,
  buildRemoteR2GetArgs,
  extractD1Rows,
  readR2BucketName,
  stagingFilenameForKey
} from './local-replica-lib.mjs';

const stagingDir = '.wrangler/local-replica';
const dataFile = join(stagingDir, 'production-content.sql');
const resetFile = join(stagingDir, 'reset-local-content.sql');
const mediaDir = join(stagingDir, 'media');
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function assertRepository() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (pkg.name !== 'flash-cards') throw new Error('Run this command from the Flash-Cards repository root.');
  if (!existsSync('wrangler.jsonc')) throw new Error('wrangler.jsonc is required.');
}

function runWrangler(args, { capture = false } = {}) {
  if (capture) {
    return execFileSync(npx, ['wrangler', ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit']
    });
  }
  execFileSync(npx, ['wrangler', ...args], { stdio: 'inherit' });
  return '';
}

function queryRemote(sql) {
  return extractD1Rows(runWrangler(buildRemoteD1QueryArgs(sql), { capture: true }));
}

function queryLocal(sql) {
  return extractD1Rows(runWrangler(buildLocalD1QueryArgs(sql), { capture: true }));
}

function ensureDevVars() {
  if (existsSync('.dev.vars')) return false;
  const secret = randomBytes(36).toString('base64url');
  writeFileSync(
    '.dev.vars',
    `# Generated for local development. Never commit this file.\nBETTER_AUTH_SECRET=${secret}\nBETTER_AUTH_URL=http://localhost:5173\n`,
    { mode: 0o600 }
  );
  console.log('Created local-only .dev.vars with a generated Better Auth secret.');
  return true;
}

function applyLocalMigrations() {
  execFileSync(npm, ['run', 'db:migrate:local'], { stdio: 'inherit' });
}

function verifyProductionTableContract() {
  const rows = queryRemote("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name");
  const names = new Set(rows.map((row) => row.name));
  const missing = CONTENT_TABLES.map((table) => table.name).filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Production D1 is missing expected content tables: ${missing.join(', ')}`);
  for (const forbidden of FORBIDDEN_PRODUCTION_TABLES) {
    if (!names.has(forbidden)) continue;
    // Presence is normal; the contract is that these tables are never queried for data.
  }
}

function collectProductionContent() {
  console.log('Reading allowlisted production content from D1 (SELECT only)...');
  verifyProductionTableContract();
  const snapshots = [];
  for (const table of CONTENT_TABLES) {
    const rows = queryRemote(table.selectSql);
    snapshots.push({ ...table, rows });
    console.log(`  ${table.name}: ${rows.length} rows`);
  }
  return snapshots;
}

function buildContentSql(snapshots) {
  return [
    '-- Generated from allowlisted production content. Auth, learner Reviews, Preview sessions and import jobs are excluded.',
    ...snapshots.map((table) => `\n-- ${table.name}\n${buildInsertSql(table.name, table.rows)}`),
    ''
  ].join('\n');
}

function refreshD1() {
  assertReplicaContract();
  applyLocalMigrations();

  // Fetch everything before touching local content so a remote read/auth failure
  // cannot leave the developer with a half-refreshed local database.
  const snapshots = collectProductionContent();

  mkdirSync(stagingDir, { recursive: true });
  writeFileSync(dataFile, buildContentSql(snapshots), { mode: 0o600 });
  writeFileSync(resetFile, buildLocalResetSql(), { mode: 0o600 });

  console.log('Replacing local content tables; local Better Auth identity is preserved...');
  runWrangler(buildLocalD1FileArgs(resetFile));
  runWrangler(buildLocalD1FileArgs(dataFile));

  console.log('Local D1 production-content replica refreshed successfully.');
  return snapshots.find((table) => table.name === 'assets')?.rows ?? [];
}

function localAssetRows() {
  return queryLocal(
    'SELECT `storage_key`, `mime_type` FROM `assets` WHERE `preview_session_id` IS NULL ORDER BY `storage_key`;'
  );
}

function refreshR2(assetRows = null) {
  const rows = assetRows ?? localAssetRows();
  const wrangler = readFileSync('wrangler.jsonc', 'utf8');
  const bucket = readR2BucketName(wrangler, 'MEDIA');
  rmSync(mediaDir, { recursive: true, force: true });
  mkdirSync(mediaDir, { recursive: true, mode: 0o700 });

  let copied = 0;
  let failed = 0;
  const failures = [];

  console.log(`Mirroring ${rows.length} teaching-media objects from production R2 into local R2...`);
  for (const [index, row] of rows.entries()) {
    const key = String(row.storage_key ?? '');
    if (!key) {
      failed += 1;
      failures.push('(empty storage key)');
      continue;
    }

    const file = join(mediaDir, stagingFilenameForKey(key));
    const remote = spawnSync(npx, ['wrangler', ...buildRemoteR2GetArgs(bucket, key, file)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe']
    });
    if (remote.status !== 0) {
      failed += 1;
      failures.push(key);
      console.warn(`  [${index + 1}/${rows.length}] could not read production R2 object: ${key}`);
      continue;
    }

    const local = spawnSync(
      npx,
      ['wrangler', ...buildLocalR2PutArgs(bucket, key, file, row.mime_type)],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
    try {
      if (existsSync(file)) unlinkSync(file);
    } catch {
      // Staging cleanup is best-effort; .wrangler remains gitignored.
    }
    if (local.status !== 0) {
      failed += 1;
      failures.push(key);
      console.warn(`  [${index + 1}/${rows.length}] could not write local R2 object: ${key}`);
      continue;
    }

    copied += 1;
    console.log(`  [${index + 1}/${rows.length}] copied ${key}`);
  }

  rmSync(mediaDir, { recursive: true, force: true });
  console.log(`Local R2 refresh complete: ${copied} copied, ${failed} failed/missing.`);
  if (failures.length) console.warn(`Missing/failed R2 keys (${failures.length}): ${failures.join(', ')}`);
  if (rows.length > 0 && copied === 0) {
    throw new Error('No production R2 objects could be copied. Check Cloudflare read authorization before retrying.');
  }
  return { expected: rows.length, copied, failed, failures };
}

function printSafetySummary() {
  console.log('\nSafety contract:');
  console.log('- production D1 operations are fixed SELECT queries only');
  console.log('- production R2 operations are object GET only');
  console.log('- all application/runtime mutations remain in local D1/R2');
  console.log('- production auth identities, sessions, learner Reviews, Preview sessions and import jobs are not mirrored');
}

async function main() {
  assertRepository();
  assertReplicaContract();
  const command = process.argv[2] ?? 'all';

  if (!['setup', 'all', 'd1', 'r2'].includes(command)) {
    throw new Error('Usage: node scripts/refresh-local-replica.mjs [setup|all|d1|r2]');
  }

  if (command === 'setup') ensureDevVars();
  printSafetySummary();

  if (command === 'd1') {
    refreshD1();
    return;
  }
  if (command === 'r2') {
    applyLocalMigrations();
    refreshR2();
    return;
  }

  const assets = refreshD1();
  refreshR2(assets.map((row) => ({ storage_key: row.storage_key, mime_type: row.mime_type })));

  if (command === 'setup') {
    console.log('\nLocal replica is ready. Next:');
    console.log('1. npm run local:admin   # create/reuse a local-only administrator');
    console.log('2. npm run dev           # start Vite/Svelte hot reload');
  }
}

main().catch((error) => {
  console.error(`\nLocal replica refresh failed: ${error.message}`);
  console.error('Production was not mutated by this workflow.');
  process.exitCode = 1;
});
