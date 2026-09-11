import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { discoverMaintainedNodeTests } from '../scripts/test-selection.mjs';

const POLICY_TEST_PATH = 'tests/current-schema-fixture-policy.test.js';
const MIGRATION_FILENAME = /\b\d{4}_[A-Za-z0-9_-]+\.sql\b/;
const APPLICATION_TEST_ROOTS = ['test/', 'tests/'];

const HISTORICAL_MIGRATION_EXCEPTIONS = new Map([
  ['test/auth-migration.test.js', { reason: 'Better Auth migration 0001 in isolation.', names: ['migrationSql'] }],
  ['test/learner-fsrs-active-review-resume-race.test.js', { reason: 'Minimal pre-FSRS schema plus migrations 0019/0020.', names: ['foundationSql', 'activeSql'] }],
  ['test/learner-fsrs-active-review-scope.test.js', { reason: 'Minimal active-review scope schema from 0019/0020.', names: ['foundationSql', 'activeSql'] }],
  ['test/learner-fsrs-active-review.test.js', { reason: 'Minimal active-review schema from 0019/0020.', names: ['foundationSql', 'activeSql'] }],
  ['test/learner-fsrs-foundation.test.js', { reason: 'Migration 0019 foundation in isolation.', names: ['foundationSql'] }],
  ['test/learner-fsrs-free-study.test.js', { reason: 'Ordered FSRS migrations 0019-0022.', names: ['foundationSql', 'activeSql', 'scheduledCompletionSql', 'freeSql'] }],
  ['test/learner-fsrs-reset-fresh.test.js', { reason: 'Ordered FSRS migrations 0019/0020/0024.', names: ['foundationSql', 'activeSql', 'resetFreshSql'] }],
  ['test/learner-fsrs-retention-admin.test.js', { reason: 'Migration 0019 foundation in a minimal historical fixture.', names: ['foundationSql'] }],
  ['test/learner-fsrs-scheduled-completion.test.js', { reason: 'Ordered FSRS migrations 0019-0021.', names: ['foundationSql', 'activeSql', 'completionSql'] }],
  ['test/learner-study-data-deletion.test.js', { reason: 'Explicit pre-0027 versus current-schema behavior.', names: ['migrationSql'] }],
  ['test/multi-topic-migration-d1.test.js', { reason: 'Migrations 0000/0002 form the historical base for applying 0003.', names: ['baseMigrationSql', 'multiTopicMigrationSql'] }],
  ['test/original-stimulus-semantics.test.js', { reason: 'Pre-0016 schema plus migration 0016 under test.', names: ['preOriginalMigrationSql', 'originalMigrationSql'] }],
  ['test/question-pool-mode-invariants.test.js', { reason: 'Migration 0014 in isolation.', names: ['migrationSql'] }],
  ['test/resumable-content-import.test.js', { reason: 'Migration 0004 checkpoint/import-job boundary behavior.', names: ['baseSql', 'importJobSql'] }],
  ['test/resumable-import-contract.test.js', { reason: 'Explicit 0000-0004 upgrade path proving resumable import schema creation.', names: ['migration'] }],
  ['test/resumable-import-lease-safety.test.js', { reason: 'Migration 0004 import-job schema in isolation.', names: ['importJobSql'] }],
  ['test/tag-shared-schema.test.js', { reason: 'Explicit 0000-0008 Stage B foundation plus pre-0008 -> 0008 upgrade/preservation behavior.', names: ['migrationUrls'] }],
]);

/** @param {string} value */
function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** @param {string} source @param {number} index */
function lineNumber(source, index) {
  return source.slice(0, index).split('\n').length;
}

/**
 * Find a small repository-specific class of literal migration bootstraps.
 * This intentionally recognizes source shapes already present in this
 * repository rather than attempting general JavaScript data-flow analysis.
 *
 * @param {string} source
 * @returns {{ kind: 'ordinary' | 'historical', name: string, line: number, description: string }[]}
 */
export function findLiteralMigrationBootstraps(source) {
  /** @type {{ kind: 'ordinary' | 'historical', name: string, line: number, description: string }[]} */
  const findings = [];
  const executionPrefix = '(?:sqlite|db|database)\\.exec\\(\\s*';
  const arrayDeclaration = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*\[([\s\S]*?)\]/g;

  for (const match of source.matchAll(arrayDeclaration)) {
    const name = match[1];
    if (!MIGRATION_FILENAME.test(match[2])) continue;

    const executionNames = new Set([name]);
    const derivedNames = new RegExp(
      `\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*=\\s*${escapeRegExp(name)}\\.map\\b`,
      'g',
    );
    for (const derived of source.matchAll(derivedNames)) executionNames.add(derived[1]);

    const executedName = [...executionNames].find((candidate) => (
      new RegExp(`${executionPrefix}${escapeRegExp(candidate)}(?:\\s*\\[[^\\]]+\\])?\\b`).test(source)
    ));
    if (!executedName) continue;

    const kind = name === 'migrationSql' || name === 'migrationNames' ? 'ordinary' : 'historical';
    findings.push({
      kind,
      name,
      line: lineNumber(source, match.index),
      description: `${kind} literal migration list "${name}" is executed as a SQLite schema`,
    });
  }

  const singleMigrationRead = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:[A-Za-z_$][\w$]*\.)?readFileSync\(\s*(?:new URL\(\s*)?[`'\"][^`'\"]*drizzle\/\d{4}_[^`'\"]+\.sql[`'\"]/g;
  for (const match of source.matchAll(singleMigrationRead)) {
    const name = match[1];
    if (!new RegExp(`${executionPrefix}${escapeRegExp(name)}\\b`).test(source)) continue;
    findings.push({
      kind: 'historical',
      name,
      line: lineNumber(source, match.index),
      description: `literal migration file "${name}" is executed as a SQLite schema`,
    });
  }

  const migrationLoader = /\bfunction\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{[\s\S]{0,500}?readFileSync\([\s\S]{0,240}?drizzle\/\$\{/g;
  for (const match of source.matchAll(migrationLoader)) {
    const name = match[1];
    if (!new RegExp(`${executionPrefix}${escapeRegExp(name)}\\s*\\(`).test(source)) continue;
    findings.push({
      kind: 'historical',
      name,
      line: lineNumber(source, match.index),
      description: `migration loader "${name}" is executed as a SQLite schema`,
    });
  }

  return findings.sort((left, right) => left.line - right.line || left.name.localeCompare(right.name));
}

/**
 * @param {string} file
 * @param {string} source
 */
export function classifyFixtureSource(file, source) {
  const historicalException = HISTORICAL_MIGRATION_EXCEPTIONS.get(file);
  const historicalReason = historicalException?.reason;
  const findings = findLiteralMigrationBootstraps(source);
  const allowed = findings.filter((finding) => (
    finding.kind === 'historical'
    && historicalException?.names.includes(finding.name)
  ));
  const violations = findings.filter((finding) => !allowed.includes(finding));
  return { historicalReason, findings, allowed, violations };
}

test('fixture-policy detector rejects literal partial schemas and scans past applyCurrentSchema', () => {
  const partial = classifyFixtureSource('tests/synthetic-partial.test.js', `
    const migrationSql = [
      '0000_dashing_centennial.sql',
      '0002_optional_stimulus_groups.sql'
    ].map((name) => readFileSync(name, 'utf8')).join('\\n');
    sqlite.exec(migrationSql);
  `);
  assert.equal(partial.violations.length, 1);
  assert.equal(partial.violations[0].kind, 'ordinary');

  const current = classifyFixtureSource('tests/synthetic-current.test.js', `
    applyCurrentSchema(sqlite);
  `);
  assert.deepEqual(current.findings, []);

  const mixed = classifyFixtureSource('tests/synthetic-mixed.test.js', `
    applyCurrentSchema(sqlite);
    const migrationSql = ['0000_dashing_centennial.sql', '0002_optional_stimulus_groups.sql'].join('\\n');
    sqlite.exec(migrationSql);
  `);
  assert.equal(mixed.violations.length, 1);
  assert.equal(mixed.violations[0].name, 'migrationSql');
});

test('fixture-policy detector allows complete dynamic enumeration and source-only migration assertions', () => {
  const dynamic = classifyFixtureSource('tests/synthetic-dynamic.test.js', `
    const migrationSql = readdirSync(new URL('../drizzle/', import.meta.url))
      .filter((name) => /^\\d{4}_.+\\.sql$/.test(name))
      .map((name) => readFileSync(name, 'utf8'));
    sqlite.exec(migrationSql);
  `);
  assert.deepEqual(dynamic.findings, []);

  const sourceOnly = classifyFixtureSource('tests/synthetic-source-only.test.js', `
    const sql = readFileSync(new URL('../drizzle/0014_review_question_pool_mode.sql', import.meta.url), 'utf8');
    assert.match(sql, /question_pool_mode/);
  `);
  assert.deepEqual(sourceOnly.findings, []);
});

test('fixture-policy historical exceptions do not exempt an additional unrelated partial bootstrap', () => {
  const mixedHistorical = classifyFixtureSource('test/multi-topic-migration-d1.test.js', `
    const baseMigrationSql = [
      readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
      readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8')
    ].join('\\n');
    const migrationSql = [
      '0000_dashing_centennial.sql',
      '0002_optional_stimulus_groups.sql'
    ].join('\\n');
    const unrelatedLegacyBootstrap = [
      readFileSync(new URL('../drizzle/0000_dashing_centennial.sql', import.meta.url), 'utf8'),
      readFileSync(new URL('../drizzle/0002_optional_stimulus_groups.sql', import.meta.url), 'utf8')
    ].join('\\n');
    sqlite.exec(baseMigrationSql);
    sqlite.exec(migrationSql);
    sqlite.exec(unrelatedLegacyBootstrap);
  `);
  assert.equal(mixedHistorical.historicalReason, 'Migrations 0000/0002 form the historical base for applying 0003.');
  assert.deepEqual(mixedHistorical.allowed.map((finding) => finding.name), ['baseMigrationSql']);
  assert.equal(mixedHistorical.allowed[0].name, 'baseMigrationSql');
  assert.deepEqual(mixedHistorical.violations.map((finding) => finding.name), ['migrationSql', 'unrelatedLegacyBootstrap']);
  assert.equal(mixedHistorical.violations[0].kind, 'ordinary');
  assert.equal(mixedHistorical.violations[1].kind, 'historical');
});

test('fixture-policy scan reuses maintained discovery and validates application-test files', async () => {
  const maintainedTests = await discoverMaintainedNodeTests();
  const applicationTests = maintainedTests.filter((file) => (
    APPLICATION_TEST_ROOTS.some((root) => file.startsWith(root)) && file !== POLICY_TEST_PATH
  ));
  const violations = [];

  for (const file of applicationTests) {
    const result = classifyFixtureSource(file, readFileSync(new URL(`../${file}`, import.meta.url), 'utf8'));
    for (const finding of result.violations) {
      violations.push({
        file,
        finding,
        expectedAction: result.historicalReason
          ? `remove the extra bootstrap; only the documented exception is allowed (${result.historicalReason})`
          : 'use current schema or add an exact documented migration-boundary exception',
      });
    }
  }

  assert.deepEqual(
    violations,
    [],
    violations.map(({ file, finding, expectedAction }) => (
      `${file}:${finding.line} ${finding.description}; expected action: ${expectedAction}`
    )).join('\n'),
  );
});
