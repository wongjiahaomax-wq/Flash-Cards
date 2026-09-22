import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readFileSync as readBytes, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { buildLocalAdminSql } from '../scripts/bootstrap-local-admin-lib.mjs';
import { refreshR2 } from '../scripts/refresh-local-replica.mjs';
import {
  CONTENT_TABLES,
  FORBIDDEN_PRODUCTION_TABLES,
  LOCAL_RESET_TABLES,
  assertReadOnlySelect,
  buildInsertSql,
  buildLocalD1FileArgs,
  buildLocalResetSql,
  buildLocalR2PutArgs,
  buildRemoteD1QueryArgs,
  buildRemoteR2GetArgs,
  buildReplicaContentSql,
  orderRowsForInsert,
  readR2BucketName
} from '../scripts/local-replica-lib.mjs';

test('replica allowlist excludes auth, learner progress, preview sessions and import jobs', () => {
  const allowed = new Set(CONTENT_TABLES.map((table) => table.name));
  for (const forbidden of FORBIDDEN_PRODUCTION_TABLES) assert.equal(allowed.has(forbidden), false, forbidden);

  for (const required of [
    'concepts',
    'cases',
    'assets',
    'question_prompts',
    'case_questions',
    'stimulus_groups',
    'stimulus_group_options',
    'asset_questions',
    'stimulus_option_asset_questions',
    'tags',
    'shared_questions',
    'image_collections'
  ]) {
    assert.equal(allowed.has(required), true, required);
  }
});

test('preview-owned rows are filtered from production-owned content queries', () => {
  for (const name of ['cases', 'assets', 'question_prompts', 'asset_questions', 'stimulus_option_asset_questions']) {
    const query = CONTENT_TABLES.find((table) => table.name === name)?.selectSql ?? '';
    assert.match(query, /preview_session_id/);
    assert.match(query, /IS NULL/i);
  }
});

test('remote D1 command builder accepts SELECT only', () => {
  const args = buildRemoteD1QueryArgs('SELECT * FROM `cases`');
  assert.ok(args.includes('--remote'));
  assert.ok(args.includes('--json'));
  assert.equal(args.includes('--local'), false);
  assert.throws(() => assertReadOnlySelect('DELETE FROM cases'), /SELECT statements only/);
  assert.throws(() => assertReadOnlySelect('SELECT 1; DROP TABLE cases'), /prohibited mutation/);
});

test('D1 import/reset command can target local storage only', () => {
  const args = buildLocalD1FileArgs('.wrangler/local-replica/content.sql');
  assert.ok(args.includes('--local'));
  assert.equal(args.includes('--remote'), false);
  assert.equal(args[0], 'd1');
  assert.equal(args[1], 'execute');
});

test('R2 command builders enforce remote GET and local PUT directions', () => {
  const get = buildRemoteR2GetArgs('flash-cards-media', 'teaching/example.png', '/tmp/example');
  assert.equal(get[2], 'get');
  assert.ok(get.includes('--remote'));
  assert.equal(get.includes('--local'), false);

  const put = buildLocalR2PutArgs('flash-cards-media', 'teaching/example.png', '/tmp/example', 'image/png');
  assert.equal(put[2], 'put');
  assert.ok(put.includes('--local'));
  assert.equal(put.includes('--remote'), false);
});

test('local R2 refresh skips inventory-present keys and copies only missing keys', async () => {
  const rows = [
    { storage_key: 'teaching/present.png', mime_type: 'image/png' },
    { storage_key: 'teaching/missing.png', mime_type: 'image/png' }
  ];
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'flash-cards-replica-r2-incremental-'));
  const commands = /** @type {Array<{ kind: string, key: string }>} */ ([]);

  try {
    const result = await refreshR2(rows, {
      stagingDirectory,
      listLocalKeys: async () => new Set(['teaching/present.png']),
      execute: async (args, context) => {
        commands.push({ kind: context.kind, key: context.key });
        if (context.kind === 'remote-get') writeFileSync(context.file, Buffer.from(context.key));
        return { status: 0 };
      }
    });

    assert.deepEqual(result, {
      total: 2,
      expected: 2,
      alreadyPresent: 1,
      copied: 1,
      failed: 0,
      failures: []
    });
    assert.deepEqual(commands, [
      { kind: 'remote-get', key: 'teaching/missing.png' },
      { kind: 'local-put', key: 'teaching/missing.png' }
    ]);
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
});

test('local R2 refresh succeeds when every current key is already present', async () => {
  const rows = [
    { storage_key: 'teaching/present-a.png', mime_type: 'image/png' },
    { storage_key: 'teaching/present-b.png', mime_type: 'image/png' }
  ];
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'flash-cards-replica-r2-all-present-'));
  let transfers = 0;

  try {
    const result = await refreshR2(rows, {
      stagingDirectory,
      listLocalKeys: async () => new Set(rows.map((row) => row.storage_key)),
      execute: async () => {
        transfers += 1;
        throw new Error('all-present refresh must not transfer');
      }
    });

    assert.equal(result.total, rows.length);
    assert.equal(result.alreadyPresent, rows.length);
    assert.equal(result.copied, 0);
    assert.equal(result.failed, 0);
    assert.deepEqual(result.failures, []);
    assert.equal(transfers, 0);
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
});

test('normal local R2 refresh fails inventory before any transfer', async () => {
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'flash-cards-replica-r2-inventory-failure-'));
  let transfers = 0;

  try {
    await assert.rejects(
      refreshR2([{ storage_key: 'teaching/not-started.png', mime_type: 'image/png' }], {
        stagingDirectory,
        listLocalKeys: async () => { throw new Error('inventory unavailable'); },
        execute: async () => {
          transfers += 1;
          return { status: 0 };
        }
      }),
      /Local R2 inventory failed before transfers: inventory unavailable/
    );
    assert.equal(transfers, 0);
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
});

test('incremental local R2 refresh retains zero-success failure for missing keys', async () => {
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'flash-cards-replica-r2-zero-success-'));

  try {
    await assert.rejects(
      refreshR2([{ storage_key: 'teaching/unavailable.png', mime_type: 'image/png' }], {
        stagingDirectory,
        listLocalKeys: async () => new Set(),
        execute: async (_args, context) => {
          assert.equal(context.kind, 'remote-get');
          return { status: 1 };
        }
      }),
      /No production R2 objects could be copied/
    );
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
});

test('forced local R2 refresh bypasses inventory and re-copies every current key', async () => {
  const rows = [
    { storage_key: 'teaching/repair-a.png', mime_type: 'image/png' },
    { storage_key: 'teaching/repair-b.png', mime_type: 'image/png' }
  ];
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'flash-cards-replica-r2-force-'));
  const commands = /** @type {Array<{ kind: string, key: string }>} */ ([]);
  let inventoryCalls = 0;

  try {
    const result = await refreshR2(rows, {
      force: true,
      stagingDirectory,
      listLocalKeys: async () => {
        inventoryCalls += 1;
        throw new Error('forced refresh must not inventory');
      },
      execute: async (args, context) => {
        commands.push({ kind: context.kind, key: context.key });
        assert.equal(args.includes('--remote'), context.kind === 'remote-get');
        assert.equal(args.includes('--local'), context.kind === 'local-put');
        if (context.kind === 'remote-get') writeFileSync(context.file, Buffer.from(context.key));
        return { status: 0 };
      }
    });

    assert.equal(result.alreadyPresent, 'not checked');
    assert.equal(result.copied, rows.length);
    assert.equal(result.failed, 0);
    assert.equal(inventoryCalls, 0);
    assert.deepEqual(
      new Set(commands.map(({ kind, key }) => `${kind}:${key}`)),
      new Set([
        'remote-get:teaching/repair-a.png',
        'local-put:teaching/repair-a.png',
        'remote-get:teaching/repair-b.png',
        'local-put:teaching/repair-b.png'
      ])
    );
    assert.equal(commands.some(({ kind }) => kind === 'delete'), false);
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
});

test('local R2 refresh overlaps at most four remote GETs while serializing local PUTs', async () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    storage_key: `teaching/asset-${index}.png`,
    mime_type: 'image/png'
  }));
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'flash-cards-replica-r2-'));
  let activeGets = 0;
  let maxGets = 0;
  let activePuts = 0;
  let maxPuts = 0;
  let getsWhilePutWasActive = 0;
  const remoteCommands = /** @type {string[][]} */ ([]);
  const localCommands = /** @type {string[][]} */ ([]);

  try {
    const result = await refreshR2(rows, {
      stagingDirectory,
      listLocalKeys: async () => new Set(),
      execute: async (args, context) => {
        if (context.kind === 'remote-get') {
          remoteCommands.push(args);
          activeGets += 1;
          maxGets = Math.max(maxGets, activeGets);
          if (activePuts > 0) getsWhilePutWasActive += 1;
          await new Promise((resolve) => setTimeout(resolve, 4));
          activeGets -= 1;
          if (context.key.endsWith('asset-1.png')) return { status: 1 };
          writeFileSync(context.file, Buffer.from(context.key));
          return { status: 0 };
        }

        localCommands.push(args);
        assert.equal(existsSync(context.file), true, 'a local PUT must follow its successful remote GET');
        assert.deepEqual([...readBytes(context.file)], [...Buffer.from(context.key)]);
        activePuts += 1;
        maxPuts = Math.max(maxPuts, activePuts);
        await new Promise((resolve) => setTimeout(resolve, 6));
        activePuts -= 1;
        if (context.key.endsWith('asset-2.png')) return { status: 1 };
        return { status: 0 };
      }
    });

    assert.equal(result.copied, 6);
    assert.equal(result.failed, 2);
    assert.deepEqual(new Set(result.failures), new Set(['teaching/asset-1.png', 'teaching/asset-2.png']));
    assert.ok(maxGets <= 4, `remote GET concurrency exceeded four: ${maxGets}`);
    assert.ok(maxGets > 1, 'independent remote GETs should overlap');
    assert.equal(maxPuts, 1, 'local R2 PUTs must remain serialized');
    assert.ok(getsWhilePutWasActive > 0, 'remote GETs should continue while the local PUT lane is active');
    assert.ok(remoteCommands.every((args) => args.includes('--remote') && !args.includes('--local')));
    assert.ok(localCommands.every((args) => args.includes('--local') && !args.includes('--remote')));
    assert.equal(existsSync(stagingDirectory), false, 'shared staging cleanup waits for all workers to settle');
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
});

test('local R2 refresh applies backpressure before claiming another asset behind a slow PUT', async () => {
  const rows = Array.from({ length: 8 }, (_, index) => ({
    storage_key: `teaching/backpressure-${index}.png`,
    mime_type: 'image/png'
  }));
  const stagingDirectory = mkdtempSync(join(tmpdir(), 'flash-cards-replica-r2-backpressure-'));
  /** @type {(value?: unknown) => void} */
  let releaseFirstPut = () => {};
  const firstPutReleasedPromise = new Promise((resolve) => { releaseFirstPut = resolve; });
  /** @type {(value?: unknown) => void} */
  let firstPutStartedResolve = () => {};
  const firstPutStarted = new Promise((resolve) => { firstPutStartedResolve = resolve; });
  let firstPutReleased = false;
  let firstLocalPut = true;
  let remoteGetsStarted = 0;
  let fifthGetBeforeRelease = false;

  try {
    const refresh = refreshR2(rows, {
      stagingDirectory,
      listLocalKeys: async () => new Set(),
      execute: async (_args, context) => {
        if (context.kind === 'remote-get') {
          remoteGetsStarted += 1;
          if (!firstPutReleased && remoteGetsStarted > 4) fifthGetBeforeRelease = true;
          await Promise.resolve();
          writeFileSync(context.file, Buffer.from(context.key));
          return { status: 0 };
        }

        if (firstLocalPut) {
          firstLocalPut = false;
          firstPutStartedResolve();
          await firstPutReleasedPromise;
        }
        return { status: 0 };
      }
    });

    await firstPutStarted;
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(remoteGetsStarted, 4, 'no worker may claim a fifth asset while the first four PUTs are outstanding');
    assert.equal(fifthGetBeforeRelease, false);

    firstPutReleased = true;
    releaseFirstPut();
    const result = await refresh;
    assert.equal(result.copied, rows.length);
    assert.equal(remoteGetsStarted, rows.length);
  } finally {
    rmSync(stagingDirectory, { recursive: true, force: true });
  }
});

test('Vite platform proxy persists local state and refuses remote binding connections', () => {
  const config = readFileSync(new URL('../svelte.config.js', import.meta.url), 'utf8');
  assert.match(config, /persist:\s*true/);
  assert.match(config, /remoteBindings:\s*false/);
});

test('local R2 inventory uses the pinned local platform proxy and shared Wrangler namespace', () => {
  const source = readFileSync(new URL('../scripts/refresh-local-replica.mjs', import.meta.url), 'utf8');
  assert.match(source, /getPlatformProxy/);
  assert.match(source, /configPath: wranglerConfigPath/);
  assert.match(source, /persist: true/);
  assert.match(source, /remoteBindings: false/);
  assert.match(source, /\.wrangler\/state\/v3/);
  assert.match(source, /MEDIA\.list|bucket\.list/);
  assert.match(source, /page\.truncated/);
  assert.match(source, /platform\.dispose/);
});

test('local reset deliberately preserves Better Auth identity tables and clears trigger-protected Original pointers first', () => {
  for (const table of ['user', 'account', 'session', 'verification']) assert.equal(LOCAL_RESET_TABLES.includes(table), false);
  for (const table of [
    'reviews',
    'review_questions',
    'review_assets',
    'preview_sessions',
    'import_jobs',
    'asset_questions',
    'stimulus_option_asset_questions'
  ]) {
    assert.equal(LOCAL_RESET_TABLES.includes(table), true);
  }
  const sql = buildLocalResetSql();
  const clearOriginal = 'UPDATE `stimulus_groups` SET `original_option_id` = NULL';
  const deleteOptions = 'DELETE FROM `stimulus_group_options`';
  assert.match(sql, /UPDATE `stimulus_groups` SET `original_option_id` = NULL/);
  assert.ok(sql.indexOf(clearOriginal) < sql.indexOf(deleteOptions));
  assert.match(sql, /UPDATE `concepts` SET `parent_id` = NULL/);
  assert.match(sql, /UPDATE `assets` SET `superseded_by_asset_id` = NULL/);
  assert.match(sql, /DELETE FROM `assets` WHERE `deduplicated_into_asset_id` IS NOT NULL/);
  assert.ok(sql.indexOf('DELETE FROM `assets` WHERE `deduplicated_into_asset_id` IS NOT NULL') < sql.indexOf('DELETE FROM `asset_questions`'));
  assert.ok(sql.indexOf('DELETE FROM `stimulus_option_asset_questions`') < sql.indexOf('DELETE FROM `asset_questions`'));
  assert.ok(sql.indexOf('DELETE FROM `asset_questions`') < sql.lastIndexOf('DELETE FROM `assets`;'));
});

test('local replica restores Original stimulus pointers only after family options are inserted', () => {
  const sql = buildReplicaContentSql([
    {
      name: 'stimulus_groups',
      rows: [{ id: 'group-1', case_id: 'case-1', original_option_id: 'option-1' }]
    },
    {
      name: 'stimulus_group_options',
      rows: [{ id: 'option-1', stimulus_group_id: 'group-1', asset_id: 'asset-1' }]
    }
  ]);

  const groupInsert = sql.indexOf('INSERT INTO `stimulus_groups`');
  const optionInsert = sql.indexOf('INSERT INTO `stimulus_group_options`');
  const restoreOriginal = sql.indexOf("UPDATE `stimulus_groups` SET `original_option_id` = 'option-1' WHERE `id` = 'group-1';");
  assert.ok(groupInsert >= 0);
  assert.ok(optionInsert > groupInsert);
  assert.ok(restoreOriginal > optionInsert);

  const groupBlock = sql.slice(groupInsert, optionInsert);
  assert.match(groupBlock, /`original_option_id`\) VALUES \('group-1', 'case-1', NULL\);/);
});

test('Topic rows are inserted parent-first even when source IDs sort child-first', () => {
  const rows = [
    { id: 'a-child', parent_id: 'z-parent', name: 'Child' },
    { id: 'z-parent', parent_id: null, name: 'Parent' },
    { id: 'b-grandchild', parent_id: 'a-child', name: 'Grandchild' }
  ];
  assert.deepEqual(orderRowsForInsert('concepts', rows).map((row) => row.id), [
    'z-parent',
    'a-child',
    'b-grandchild'
  ]);
  const sql = buildInsertSql('concepts', rows);
  assert.ok(sql.indexOf("'z-parent'") < sql.indexOf("'a-child'"));
});

test('Topic hierarchy import fails closed on missing parents or cycles', () => {
  assert.throws(
    () => orderRowsForInsert('concepts', [{ id: 'child', parent_id: 'missing' }]),
    /missing parent/
  );
  assert.throws(
    () =>
      orderRowsForInsert('concepts', [
        { id: 'one', parent_id: 'two' },
        { id: 'two', parent_id: 'one' }
      ]),
    /cycle detected/
  );
});

test('Asset supersession rows are inserted successor-first regardless of Asset ID ordering', () => {
  const rows = [
    { id: 'a-old', superseded_by_asset_id: 'm-current', storage_key: 'old.png' },
    { id: 'm-current', superseded_by_asset_id: 'z-newest', storage_key: 'current.png' },
    { id: 'z-newest', superseded_by_asset_id: null, storage_key: 'newest.png' }
  ];
  assert.deepEqual(orderRowsForInsert('assets', rows).map((row) => row.id), [
    'z-newest',
    'm-current',
    'a-old'
  ]);
  const sql = buildInsertSql('assets', rows);
  assert.ok(sql.indexOf("'z-newest'") < sql.indexOf("'m-current'"));
  assert.ok(sql.indexOf("'m-current'") < sql.indexOf("'a-old'"));
});

test('Asset supersession import fails closed on missing successors or cycles', () => {
  assert.throws(
    () => orderRowsForInsert('assets', [{ id: 'old', superseded_by_asset_id: 'missing' }]),
    /missing successor/
  );
  assert.throws(
    () =>
      orderRowsForInsert('assets', [
        { id: 'one', superseded_by_asset_id: 'two' },
        { id: 'two', superseded_by_asset_id: 'one' }
      ]),
    /cycle detected/
  );
});

test('Asset deduplication tombstones are inserted target-first and fail closed on missing targets or cycles', () => {
  const rows = [
    { id: 'duplicate', deduplicated_into_asset_id: 'survivor' },
    { id: 'survivor', deduplicated_into_asset_id: null }
  ];
  assert.deepEqual(orderRowsForInsert('assets', rows).map((row) => row.id), ['survivor', 'duplicate']);
  assert.throws(
    () => orderRowsForInsert('assets', [{ id: 'duplicate', deduplicated_into_asset_id: 'missing' }]),
    /missing dedupe target/
  );
  assert.throws(
    () => orderRowsForInsert('assets', [
      { id: 'one', deduplicated_into_asset_id: 'two' },
      { id: 'two', deduplicated_into_asset_id: 'one' }
    ]),
    /cycle detected/
  );
});

test('row serialization escapes SQL values and preserves nulls', () => {
  const sql = buildInsertSql('cases', [{ id: "case'1", title: 'Example', vignette_md: null }]);
  assert.match(sql, /case''1/);
  assert.match(sql, /NULL/);
  assert.match(sql, /INSERT INTO `cases`/);
});

test('R2 bucket is resolved from the configured MEDIA binding', () => {
  const config = `{
    "r2_buckets": [
      { "binding": "MEDIA", "bucket_name": "flash-cards-media" }
    ]
  }`;
  assert.equal(readR2BucketName(config), 'flash-cards-media');
});

test('local administrator SQL creates an admin credential account without remote concerns', () => {
  const sql = buildLocalAdminSql({
    userId: 'u-1',
    accountId: 'a-1',
    name: "Local O'Admin",
    email: 'local@example.test',
    passwordHash: 'hash-value',
    now: 123
  });
  assert.match(sql, /'admin'/);
  assert.match(sql, /'credential'/);
  assert.match(sql, /Local O''Admin/);
  assert.match(sql, /hash-value/);
});
