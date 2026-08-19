import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildLocalAdminSql } from '../scripts/bootstrap-local-admin-lib.mjs';
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
    'tags',
    'shared_questions',
    'image_collections'
  ]) {
    assert.equal(allowed.has(required), true, required);
  }
});

test('preview-owned rows are filtered from production-owned content queries', () => {
  for (const name of ['cases', 'assets', 'question_prompts']) {
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

test('Vite platform proxy persists local state and refuses remote binding connections', () => {
  const config = readFileSync(new URL('../svelte.config.js', import.meta.url), 'utf8');
  assert.match(config, /persist:\s*true/);
  assert.match(config, /remoteBindings:\s*false/);
});

test('local reset deliberately preserves Better Auth identity tables', () => {
  for (const table of ['user', 'account', 'session', 'verification']) assert.equal(LOCAL_RESET_TABLES.includes(table), false);
  for (const table of ['reviews', 'review_questions', 'review_assets', 'preview_sessions', 'import_jobs']) {
    assert.equal(LOCAL_RESET_TABLES.includes(table), true);
  }
  assert.match(buildLocalResetSql(), /UPDATE `concepts` SET `parent_id` = NULL/);
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
