import { execFileSync, spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { getPlatformProxy } from 'wrangler';

import { buildLocalLearnerRuntimeResetSql } from './local-learner-runtime-reset.mjs';
import {
  CONTENT_TABLES,
  FORBIDDEN_PRODUCTION_TABLES,
  assertReplicaContract,
  buildLocalD1FileArgs,
  buildLocalD1QueryArgs,
  buildLocalResetSql,
  buildLocalR2PutArgs,
  buildRemoteD1QueryArgs,
  buildRemoteR2GetArgs,
  buildReplicaContentSql,
  extractD1Rows,
  readR2BucketName,
  stagingFilenameForKey
} from './local-replica-lib.mjs';

/** @typedef {string | number | boolean | null} D1Value */
/** @typedef {Record<string, D1Value>} D1Row */
/** @typedef {{ name: string, selectSql: string, rows: D1Row[] }} ContentSnapshot */
/** @typedef {{ total: number, expected: number, alreadyPresent: number | 'not checked', copied: number, failed: number, failures: string[] }} R2RefreshResult */

const stagingDir = '.wrangler/local-replica';
const dataFile = join(stagingDir, 'production-content.sql');
const resetFile = join(stagingDir, 'reset-local-content.sql');
const mediaDir = join(stagingDir, 'media');
const wranglerCli = join('node_modules', 'wrangler', 'bin', 'wrangler.js');
const wranglerConfigPath = resolve('wrangler.jsonc');
// `persist: true` uses Wrangler's default local namespace, `.wrangler/state/v3`.
// Keep this explicit so CLI `--local`, Vite's platform proxy, and this inventory
// all point at the same checkout-local resources.
const localPersistencePath = resolve('.wrangler/state/v3');

/** @returns {Promise<Set<string>>} */
export async function listLocalR2Keys() {
  console.log(`Inventorying local MEDIA from ${wranglerConfigPath} at ${localPersistencePath} (remoteBindings=false)...`);
  const platform = await getPlatformProxy({
    configPath: wranglerConfigPath,
    persist: true,
    remoteBindings: false
  });

  try {
    const bucket = /** @type {R2Bucket | undefined} */ (/** @type {unknown} */ (platform.env?.MEDIA));
    if (!bucket || typeof bucket.list !== 'function') {
      throw new Error(`Local MEDIA binding is unavailable in ${wranglerConfigPath}.`);
    }

    const keys = new Set();
    let cursor;
    do {
      const page = await bucket.list(cursor ? { cursor } : undefined);
      for (const object of page.objects ?? []) keys.add(String(object.key));
      if (page.truncated && !page.cursor) throw new Error('Local MEDIA inventory page was truncated without a cursor.');
      cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);

    return keys;
  } finally {
    await platform.dispose();
  }
}

function assertRepository() {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  if (pkg.name !== 'flash-cards') throw new Error('Run this command from the Flash-Cards repository root.');
  if (!existsSync('wrangler.jsonc')) throw new Error('wrangler.jsonc is required.');
  if (!existsSync(wranglerCli)) throw new Error('Wrangler CLI is not installed. Run npm ci before local setup.');
}

/** @param {string[]} args @param {{ capture?: boolean }} [options] */
function runWrangler(args, { capture = false } = {}) {
  if (capture) {
    return execFileSync(process.execPath, [wranglerCli, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit']
    });
  }
  execFileSync(process.execPath, [wranglerCli, ...args], { stdio: 'inherit' });
  return '';
}

/** @param {string[]} args @returns {Promise<{ status: number, stderr: string }>} */
function runWranglerAsync(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [wranglerCli, ...args], {
      stdio: ['ignore', 'ignore', 'pipe'],
      windowsHide: true,
      shell: false
    });
    let stderr = '';
    let settled = false;
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    /** @param {{ status: number, stderr: string }} result */
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    child.once('error', (error) => finish({ status: 1, stderr: `${stderr}${error instanceof Error ? error.message : String(error)}` }));
    child.once('close', (status) => finish({ status: typeof status === 'number' ? status : 1, stderr }));
  });
}

/** @param {string} sql @returns {D1Row[]} */
function queryRemote(sql) {
  return extractD1Rows(runWrangler(buildRemoteD1QueryArgs(sql), { capture: true }));
}

/** @param {string} sql @returns {D1Row[]} */
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
  runWrangler(['d1', 'migrations', 'apply', 'DB', '--local']);
}

function verifyProductionTableContract() {
  const rows = queryRemote("SELECT name FROM sqlite_schema WHERE type='table' ORDER BY name");
  const names = new Set(rows.map((row) => String(row.name)));
  const missing = CONTENT_TABLES.map((table) => table.name).filter((name) => !names.has(name));
  if (missing.length) throw new Error(`Production D1 is missing expected content tables: ${missing.join(', ')}`);
  for (const forbidden of FORBIDDEN_PRODUCTION_TABLES) {
    if (!names.has(forbidden)) continue;
    // Presence is normal; the contract is that these tables are never queried for data.
  }
}

/** @returns {ContentSnapshot[]} */
function collectProductionContent() {
  console.log('Reading allowlisted production content from D1 (SELECT only)...');
  verifyProductionTableContract();
  /** @type {ContentSnapshot[]} */
  const snapshots = [];
  for (const table of CONTENT_TABLES) {
    const rows = queryRemote(table.selectSql);
    snapshots.push({ ...table, rows });
    console.log(`  ${table.name}: ${rows.length} rows`);
  }
  return snapshots;
}

/** @returns {D1Row[]} */
function refreshD1() {
  assertReplicaContract();
  applyLocalMigrations();

  // Fetch everything before touching local content so a remote read/auth failure
  // cannot leave the developer with a half-refreshed local database.
  const snapshots = collectProductionContent();

  mkdirSync(stagingDir, { recursive: true });
  writeFileSync(dataFile, buildReplicaContentSql(snapshots), { mode: 0o600 });
  writeFileSync(
    resetFile,
    `${buildLocalLearnerRuntimeResetSql()}\n${buildLocalResetSql()}`,
    { mode: 0o600 }
  );

  console.log('Replacing local content tables; local Better Auth identity and learner settings are preserved, while local learner Review/progress state is reset...');
  runWrangler(buildLocalD1FileArgs(resetFile));
  runWrangler(buildLocalD1FileArgs(dataFile));

  console.log('Local D1 production-content replica refreshed successfully.');
  return snapshots.find((table) => table.name === 'assets')?.rows ?? [];
}

/** @returns {D1Row[]} */
function localAssetRows() {
  return queryLocal(
    'SELECT `storage_key`, `mime_type` FROM `assets` WHERE `preview_session_id` IS NULL ORDER BY `storage_key`;'
  );
}

/**
 * @param {D1Row[] | null} [assetRows]
 * @param {{ execute?: (args: string[], context: { kind: 'remote-get' | 'local-put', key: string, file: string }) => Promise<{ status: number, stderr?: string }>, listLocalKeys?: () => Promise<Iterable<string>>, stagingDirectory?: string, force?: boolean }} [options]
 * @returns {Promise<R2RefreshResult>}
 */
export async function refreshR2(assetRows = null, options = {}) {
  const rows = assetRows ?? localAssetRows();
  const wrangler = readFileSync('wrangler.jsonc', 'utf8');
  const bucket = readR2BucketName(wrangler, 'MEDIA');
  const stagingDirectory = options.stagingDirectory ?? mediaDir;
  const execute = options.execute ?? (async (args) => runWranglerAsync(args));
  const force = options.force === true;
  let rowsToCopy = rows;
  /** @type {number | 'not checked'} */
  let alreadyPresent = 'not checked';
  if (!force) {
    let localKeys;
    try {
      localKeys = new Set(await (options.listLocalKeys ?? listLocalR2Keys)());
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Local R2 inventory failed before transfers: ${reason}`, { cause: error });
    }

    rowsToCopy = rows.filter((row) => {
      const key = String(row.storage_key ?? '');
      return !key || !localKeys.has(key);
    });
    alreadyPresent = rows.length - rowsToCopy.length;
  }

  rmSync(stagingDirectory, { recursive: true, force: true });
  mkdirSync(stagingDirectory, { recursive: true, mode: 0o700 });

  let copied = 0;
  let failed = 0;
  /** @type {string[]} */
  const failures = [];
  let nextIndex = 0;
  let writeTail = Promise.resolve();
  /** @type {Promise<void>[]} */
  const pendingWrites = [];

  /** @param {string} key @param {string} reason */
  function recordFailure(key, reason) {
    failed += 1;
    failures.push(key);
    console.warn(`  could not ${reason}: ${key}`);
  }

  /** @param {() => Promise<void>} operation @returns {Promise<void>} */
  function enqueueLocalWrite(operation) {
    const result = writeTail.then(operation, operation);
    writeTail = result.then(() => undefined, () => undefined);
    pendingWrites.push(result);
    return result;
  }

  /** @param {D1Row} row @param {number} index */
  async function processAsset(row, index) {
    const key = String(row.storage_key ?? '');
    if (!key) {
      recordFailure('(empty storage key)', 'read production R2 object');
      return;
    }

    const file = join(stagingDirectory, stagingFilenameForKey(key));
    try {
      const remote = await execute(buildRemoteR2GetArgs(bucket, key, file), { kind: 'remote-get', key, file });
      if (Number(remote?.status) !== 0) {
        recordFailure(key, 'read production R2 object');
        try { if (existsSync(file)) unlinkSync(file); } catch { /* best-effort per-key cleanup */ }
        return;
      }

      await enqueueLocalWrite(async () => {
        try {
          const local = await execute(
            buildLocalR2PutArgs(bucket, key, file, String(row.mime_type ?? '')),
            { kind: 'local-put', key, file }
          );
          if (Number(local?.status) !== 0) {
            recordFailure(key, 'write local R2 object');
            return;
          }
          copied += 1;
          console.log(`  [${index + 1}/${rowsToCopy.length}] copied ${key}`);
        } catch {
          recordFailure(key, 'write local R2 object');
        } finally {
          try { if (existsSync(file)) unlinkSync(file); } catch { /* best-effort per-key cleanup */ }
        }
      });
    } catch {
      recordFailure(key, 'read production R2 object');
      try { if (existsSync(file)) unlinkSync(file); } catch { /* best-effort per-key cleanup */ }
    }
  }

  async function downloadWorker() {
    while (true) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= rowsToCopy.length) return;
      await processAsset(rowsToCopy[index], index);
    }
  }

  console.log(
    `${force ? 'Force re-copying' : 'Incrementally mirroring'} ${rowsToCopy.length} of ${rows.length} teaching-media objects from production R2 into local R2 (${force ? 'already present=not checked' : `${alreadyPresent} already present`})...`
  );
  try {
    const workerCount = Math.min(4, rowsToCopy.length);
    await Promise.allSettled(Array.from({ length: workerCount }, () => downloadWorker()));
    await Promise.allSettled(pendingWrites);
  } finally {
    // Every started download and local write has settled before the shared
    // directory is removed. Per-key cleanup remains best-effort above.
    rmSync(stagingDirectory, { recursive: true, force: true });
  }

  console.log(`Local R2 refresh complete: total=${rows.length}, already present=${alreadyPresent}, copied=${copied}, failed=${failed}.`);
  if (failures.length) console.warn(`Missing/failed R2 keys (${failures.length}): ${failures.join(', ')}`);
  if (rowsToCopy.length > 0 && copied === 0) {
    throw new Error('No production R2 objects could be copied. Check Cloudflare read authorization before retrying.');
  }
  return { total: rows.length, expected: rows.length, alreadyPresent, copied, failed, failures };
}

function printSafetySummary() {
  console.log('\nSafety contract:');
  console.log('- production D1 operations are fixed SELECT queries only');
  console.log('- production R2 operations are object GET only');
  console.log('- all application/runtime mutations remain in local D1/R2');
  console.log('- production auth identities, sessions, learner Reviews, Preview sessions and import jobs are not mirrored');
  console.log('- D1 content refresh clears local learner Review/progress rows tied to the previous content snapshot');
}

async function main() {
  assertRepository();
  assertReplicaContract();
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log('Usage: node scripts/refresh-local-replica.mjs [setup|all|d1|r2] [--force]');
    console.log('  default, setup, all  refresh Production content into local D1 and incrementally refresh local R2');
    console.log('  d1                    refresh only local D1 content');
    console.log('  r2                    incrementally refresh local R2 from local D1 Asset keys');
    console.log('  --force               bypass local inventory and re-copy every current Asset key; never deletes local objects');
    return;
  }

  const force = args.includes('--force');
  const commandArgs = args.filter((arg) => arg !== '--force');
  const command = commandArgs[0] ?? 'all';

  if (commandArgs.length > 1 || !['setup', 'all', 'd1', 'r2'].includes(command)) {
    throw new Error('Usage: node scripts/refresh-local-replica.mjs [setup|all|d1|r2] [--force]');
  }
  if (force && command === 'd1') {
    throw new Error('--force applies only to the local R2 refresh (setup, all, or r2).');
  }

  if (command === 'setup') ensureDevVars();
  printSafetySummary();

  if (command === 'd1') {
    refreshD1();
    return;
  }
  if (command === 'r2') {
    applyLocalMigrations();
    await refreshR2(null, { force });
    return;
  }

  const assets = refreshD1();
  await refreshR2(assets.map((row) => ({ storage_key: row.storage_key, mime_type: row.mime_type })), { force });

  if (command === 'setup') {
    console.log('\nLocal replica is ready. Next:');
    console.log('1. npm run local:admin   # create/reuse a local-only administrator');
    console.log('2. npm run dev           # start Vite/Svelte hot reload');
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`\nLocal replica refresh failed: ${message}`);
    console.error('Production was not mutated by this workflow.');
    process.exitCode = 1;
  });
}
