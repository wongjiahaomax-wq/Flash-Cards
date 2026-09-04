import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '..');
const wranglerCli = join(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
function sanitizedEnvironment() {
  const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID']) delete env[key];
  return env;
}
function argsFor(configPath, stateDir, command) {
  return [
    wranglerCli, 'd1', 'execute', 'DB', '--local', '--persist-to', stateDir,
    '--config', configPath, '--command', command
  ];
}
function execute(configPath, stateDir, env, command) {
  return spawnSync(process.execPath, argsFor(configPath, stateDir, command), {
    cwd: dirname(configPath), env, encoding: 'utf8'
  });
}
function scope(systemId, runScope) {
  return JSON.stringify({ version: 2, systemId, runScope });
}
function insertReviewSql(id, caseId, systemId, scopeJson) {
  return `INSERT INTO active_reviews (
    id, user_id, case_id, system_id, study_mode, content_mode,
    run_id, scope_fingerprint, scope_json, case_title_snapshot
  ) VALUES (
    ${sqlString(id)}, 'multi-v2-user', ${sqlString(caseId)}, ${sqlString(systemId)},
    'free', 'original', ${sqlString(`run-${id}`)}, ${sqlString(`fp-${id}`)},
    ${sqlString(scopeJson)}, ${sqlString(`Snapshot ${id}`)}
  );`;
}
function seedSql(now) {
  return `
PRAGMA foreign_keys = ON;
INSERT INTO \`user\` (id, name, email, emailVerified, createdAt, updatedAt)
VALUES ('multi-v2-user', 'Multi v2 D1', 'multi-v2@example.test', 1, ${now}, ${now});
INSERT INTO concepts (id, name, slug, kind, parent_id, is_active) VALUES
  ('cardio', 'Cardio', 'multi-v2-cardio', 'system', NULL, 1),
  ('metabolic', 'Metabolic', 'multi-v2-metabolic', 'system', NULL, 1),
  ('cardio-topic', 'Cardio Topic', 'multi-v2-cardio-topic', 'topic', 'cardio', 1),
  ('metabolic-topic', 'Metabolic Topic', 'multi-v2-metabolic-topic', 'topic', 'metabolic', 1),
  ('metabolic-wrong', 'Metabolic Wrong', 'multi-v2-metabolic-wrong', 'topic', 'metabolic', 1),
  ('inactive-topic', 'Inactive Topic', 'multi-v2-inactive-topic', 'topic', 'cardio', 0);
INSERT INTO cases (id, title, vignette_md, question_selection_mode, question_count, preview_session_id, is_active) VALUES
  ('native-cardio', 'Native Cardio', NULL, 'all', NULL, NULL, 1),
  ('cross-case', 'Cross Case', NULL, 'all', NULL, NULL, 1),
  ('inactive-primary-case', 'Inactive Primary', NULL, 'all', NULL, NULL, 1),
  ('missing-primary-case', 'Missing Primary', NULL, 'all', NULL, NULL, 1);
INSERT INTO case_concepts (case_id, concept_id, role) VALUES
  ('native-cardio', 'cardio-topic', 'primary'),
  ('cross-case', 'metabolic-topic', 'primary'),
  ('inactive-primary-case', 'inactive-topic', 'primary');
INSERT INTO tags (id, name, normalized_name, is_active) VALUES
  ('cross-tag', 'Cross Tag', 'multi v2 cross tag', 1),
  ('other-tag', 'Other Tag', 'multi v2 other tag', 1);
INSERT INTO system_tags (system_concept_id, tag_id, display_order) VALUES
  ('cardio', 'cross-tag', 0),
  ('metabolic', 'other-tag', 0);
INSERT INTO case_tags (case_id, tag_id) VALUES
  ('cross-case', 'cross-tag'),
  ('inactive-primary-case', 'cross-tag'),
  ('missing-primary-case', 'cross-tag');
`;
}

async function main() {
  const workDir = await mkdtemp(join(tmpdir(), 'flash-cards-multi-v2-d1-'));
  const stateDir = join(workDir, 'state');
  const configPath = join(workDir, 'wrangler.json');
  const seedPath = join(workDir, 'seed.sql');
  const env = sanitizedEnvironment();
  await cp(join(repoRoot, 'drizzle'), join(workDir, 'drizzle'), { recursive: true });
  await writeFile(configPath, `${JSON.stringify({
    name: 'flash-cards-multi-v2-d1-acceptance',
    main: './unused.js',
    compatibility_date: '2026-08-14',
    d1_databases: [{
      binding: 'DB',
      database_name: 'flash-cards-multi-v2-d1-acceptance',
      database_id: '00000000-0000-0000-0000-000000000226',
      migrations_dir: './drizzle'
    }]
  }, null, 2)}\n`);
  await writeFile(join(workDir, 'unused.js'), 'export default {};\n');
  await writeFile(seedPath, seedSql(Date.now()));

  try {
    execFileSync(process.execPath, [wranglerCli, 'd1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir, '--config', configPath], {
      cwd: workDir, env, stdio: 'inherit'
    });
    execFileSync(process.execPath, [wranglerCli, 'd1', 'execute', 'DB', '--local', '--persist-to', stateDir, '--config', configPath, '--file', seedPath], {
      cwd: workDir, env, stdio: 'inherit'
    });

    const results = [];
    let serial = 0;
    const expectPass = (name, caseId, systemId, scopeJson) => {
      serial += 1;
      const result = execute(configPath, stateDir, env, `${insertReviewSql(`ok-${serial}`, caseId, systemId, scopeJson)} DELETE FROM active_reviews WHERE id = 'ok-${serial}';`);
      assert.equal(result.status, 0, `${name} should pass: ${result.stderr || result.stdout}`);
      results.push({ name, outcome: 'pass' });
    };
    const expectFail = (name, caseId, systemId, scopeJson, code) => {
      serial += 1;
      const result = execute(configPath, stateDir, env, insertReviewSql(`bad-${serial}`, caseId, systemId, scopeJson));
      assert.notEqual(result.status, 0, `${name} should fail`);
      const output = `${result.stdout}\n${result.stderr}`;
      assert.match(output, new RegExp(code), `${name} should fail with ${code}: ${output}`);
      results.push({ name, outcome: code });
    };

    const cardioAll = { systems: [{ systemId: 'cardio', mode: 'all' }] };
    const metabolicAll = { systems: [{ systemId: 'metabolic', mode: 'all' }] };
    const cardioTag = { systems: [{ systemId: 'cardio', mode: 'routes', routes: [{ routeType: 'tag', routeId: 'cross-tag' }] }] };
    expectPass('whole-System native Topic', 'native-cardio', 'cardio', scope('cardio', cardioAll));
    expectPass('curated Tag route', 'cross-case', 'cardio', scope('cardio', cardioTag));
    expectPass('whole-System curated Tag reachability', 'cross-case', 'cardio', scope('cardio', cardioAll));
    expectPass('whole-System native attribution', 'cross-case', 'metabolic', scope('metabolic', metabolicAll));

    expectFail(
      'forged unselected attribution', 'cross-case', 'metabolic', scope('metabolic', cardioTag), 'active_review_ineligible_scope'
    );
    expectFail(
      'selected System wrong route', 'cross-case', 'metabolic',
      scope('metabolic', { systems: [{ systemId: 'metabolic', mode: 'routes', routes: [{ routeType: 'topic', routeId: 'metabolic-wrong' }] }] }),
      'active_review_ineligible_scope'
    );
    expectFail(
      'duplicate System entries', 'native-cardio', 'cardio',
      scope('cardio', { systems: [{ systemId: 'cardio', mode: 'all' }, { systemId: 'cardio', mode: 'all' }] }),
      'active_review_invalid_scope_v2'
    );
    expectFail(
      'contradictory all plus routes shape', 'native-cardio', 'cardio',
      scope('cardio', { systems: [{ systemId: 'cardio', mode: 'all', routes: [{ routeType: 'topic', routeId: 'cardio-topic' }] }] }),
      'active_review_invalid_scope_v2'
    );
    expectFail(
      'inactive primary Topic under curated Tag', 'inactive-primary-case', 'cardio', scope('cardio', cardioTag),
      'active_review_ineligible_scope'
    );
    expectFail(
      'missing primary Topic under curated Tag', 'missing-primary-case', 'cardio', scope('cardio', cardioTag),
      'active_review_ineligible_scope'
    );
    expectFail(
      'attribution System not selected', 'native-cardio', 'cardio', scope('cardio', metabolicAll),
      'active_review_ineligible_scope'
    );

    const guard = execute(configPath, stateDir, env,
      "SELECT sql FROM sqlite_master WHERE type='trigger' AND name='active_reviews_content_scope_guard';");
    assert.equal(guard.status, 0);
    assert.match(guard.stdout, /active_review_invalid_scope_v2/);
    assert.match(guard.stdout, /runScope/);

    console.log(JSON.stringify({ runtime: 'Wrangler local D1 after all repository migrations', migration: '0026_multi_system_active_review_scope_v2.sql', results }, null, 2));
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(`Multi-System v2 migrated-D1 acceptance failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
