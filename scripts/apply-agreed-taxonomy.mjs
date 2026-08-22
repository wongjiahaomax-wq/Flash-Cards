#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const cardiologyId = '65862404-8493-408c-8de7-ccf385209924';
export const hypercalcemiaCaseId = 'b1f4870e-52fe-4d26-bbea-851ec64357a7';
export const hypocalcemiaCaseId = 'b11b6a14-c55e-4d70-849c-ce1c8953a38f';

// These IDs are only used when a Topic with the agreed slug does not already
// exist. Existing rows are reused by slug. A collision with an unrelated row
// using one of these reserved IDs is rejected before any write is attempted.
export const topicIds = {
  electrolyteDisorders: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f01',
  hypercalcemia: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f02',
  hypocalcemia: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f03',
  ecgFindings: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f04',
  shortQtc: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f05',
  prolongedQtc: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f06'
};

export const preflightSql = `
SELECT 'topic' AS record_type, id, name, slug, parent_id, is_active
FROM concepts
WHERE id = '${cardiologyId}'
   OR slug IN ('electrolyte-disorders', 'hypercalcemia', 'hypocalcemia', 'ecg-findings', 'short-qtc', 'prolonged-qtc')
UNION ALL
SELECT 'case-route', ca.id, ca.title, c.slug, cc.role, ca.is_active
FROM cases ca
JOIN case_concepts cc ON cc.case_id = ca.id
JOIN concepts c ON c.id = cc.concept_id
WHERE ca.id IN ('${hypercalcemiaCaseId}', '${hypocalcemiaCaseId}')
ORDER BY record_type, id, slug;
`;

export const preconditionSql = `
SELECT
  (SELECT COUNT(*) FROM concepts
   WHERE id = '${cardiologyId}' AND name = 'Cardiology' AND slug = 'cardiology' AND is_active = 1) AS cardiology_ok,
  (SELECT COUNT(*) FROM cases
   WHERE id = '${hypercalcemiaCaseId}' AND is_active = 1) AS hypercalcemia_case_ok,
  (SELECT COUNT(*) FROM cases
   WHERE id = '${hypocalcemiaCaseId}' AND is_active = 1) AS hypocalcemia_case_ok,
  (SELECT COUNT(*) FROM case_concepts
   WHERE case_id = '${hypercalcemiaCaseId}' AND role = 'primary') AS hypercalcemia_primary_count,
  (SELECT COUNT(*)
   FROM case_concepts cc
   JOIN concepts c ON c.id = cc.concept_id
   WHERE cc.case_id = '${hypercalcemiaCaseId}'
     AND cc.role = 'primary'
     AND (cc.concept_id = '${cardiologyId}' OR c.slug = 'hypercalcemia')) AS hypercalcemia_primary_allowed,
  (SELECT COUNT(*) FROM case_concepts
   WHERE case_id = '${hypocalcemiaCaseId}' AND role = 'primary') AS hypocalcemia_primary_count,
  (SELECT COUNT(*)
   FROM case_concepts cc
   JOIN concepts c ON c.id = cc.concept_id
   WHERE cc.case_id = '${hypocalcemiaCaseId}'
     AND cc.role = 'primary'
     AND (cc.concept_id = '${cardiologyId}' OR c.slug = 'hypocalcemia')) AS hypocalcemia_primary_allowed,
  (SELECT COUNT(*) FROM concepts WHERE
      (id = '${topicIds.electrolyteDisorders}' AND slug <> 'electrolyte-disorders')
   OR (id = '${topicIds.hypercalcemia}' AND slug <> 'hypercalcemia')
   OR (id = '${topicIds.hypocalcemia}' AND slug <> 'hypocalcemia')
   OR (id = '${topicIds.ecgFindings}' AND slug <> 'ecg-findings')
   OR (id = '${topicIds.shortQtc}' AND slug <> 'short-qtc')
   OR (id = '${topicIds.prolongedQtc}' AND slug <> 'prolonged-qtc')) AS reserved_id_collisions;
`;

// Do not add BEGIN/COMMIT here. Wrangler sends multiple D1 statements as one
// batch, and D1 provides the transaction boundary for that batch.
export const mutationSql = `
INSERT INTO concepts (id, name, slug, parent_id, is_active)
VALUES ('${topicIds.electrolyteDisorders}', 'Electrolyte Disorders', 'electrolyte-disorders', NULL, 1)
ON CONFLICT(slug) DO UPDATE SET name = excluded.name, parent_id = excluded.parent_id, is_active = 1;

INSERT INTO concepts (id, name, slug, parent_id, is_active)
VALUES ('${topicIds.hypercalcemia}', 'Hypercalcemia', 'hypercalcemia', NULL, 1)
ON CONFLICT(slug) DO UPDATE SET name = excluded.name, parent_id = (SELECT id FROM concepts WHERE slug = 'electrolyte-disorders'), is_active = 1;

INSERT INTO concepts (id, name, slug, parent_id, is_active)
VALUES ('${topicIds.hypocalcemia}', 'Hypocalcemia', 'hypocalcemia', NULL, 1)
ON CONFLICT(slug) DO UPDATE SET name = excluded.name, parent_id = (SELECT id FROM concepts WHERE slug = 'electrolyte-disorders'), is_active = 1;

INSERT INTO concepts (id, name, slug, parent_id, is_active)
VALUES ('${topicIds.ecgFindings}', 'ECG Findings', 'ecg-findings', '${cardiologyId}', 1)
ON CONFLICT(slug) DO UPDATE SET name = excluded.name, parent_id = '${cardiologyId}', is_active = 1;

INSERT INTO concepts (id, name, slug, parent_id, is_active)
VALUES ('${topicIds.shortQtc}', 'Short QTc', 'short-qtc', NULL, 1)
ON CONFLICT(slug) DO UPDATE SET name = excluded.name, parent_id = (SELECT id FROM concepts WHERE slug = 'ecg-findings'), is_active = 1;

INSERT INTO concepts (id, name, slug, parent_id, is_active)
VALUES ('${topicIds.prolongedQtc}', 'Prolonged QTc', 'prolonged-qtc', NULL, 1)
ON CONFLICT(slug) DO UPDATE SET name = excluded.name, parent_id = (SELECT id FROM concepts WHERE slug = 'ecg-findings'), is_active = 1;

UPDATE concepts SET parent_id = (SELECT id FROM concepts WHERE slug = 'electrolyte-disorders')
WHERE slug IN ('hypercalcemia', 'hypocalcemia');
UPDATE concepts SET parent_id = (SELECT id FROM concepts WHERE slug = 'ecg-findings')
WHERE slug IN ('short-qtc', 'prolonged-qtc');

UPDATE case_concepts
SET role = 'secondary'
WHERE case_id = '${hypercalcemiaCaseId}'
  AND role = 'primary'
  AND concept_id <> (SELECT id FROM concepts WHERE slug = 'hypercalcemia');
INSERT INTO case_concepts (case_id, concept_id, role)
SELECT '${hypercalcemiaCaseId}', id, 'primary' FROM concepts WHERE slug = 'hypercalcemia'
ON CONFLICT(case_id, concept_id) DO UPDATE SET role = 'primary';
INSERT INTO case_concepts (case_id, concept_id, role)
SELECT '${hypercalcemiaCaseId}', id, 'secondary' FROM concepts WHERE slug = 'short-qtc'
ON CONFLICT(case_id, concept_id) DO UPDATE SET role = 'secondary';
DELETE FROM case_concepts
WHERE case_id = '${hypercalcemiaCaseId}' AND concept_id = '${cardiologyId}';

UPDATE case_concepts
SET role = 'secondary'
WHERE case_id = '${hypocalcemiaCaseId}'
  AND role = 'primary'
  AND concept_id <> (SELECT id FROM concepts WHERE slug = 'hypocalcemia');
INSERT INTO case_concepts (case_id, concept_id, role)
SELECT '${hypocalcemiaCaseId}', id, 'primary' FROM concepts WHERE slug = 'hypocalcemia'
ON CONFLICT(case_id, concept_id) DO UPDATE SET role = 'primary';
INSERT INTO case_concepts (case_id, concept_id, role)
SELECT '${hypocalcemiaCaseId}', id, 'secondary' FROM concepts WHERE slug = 'prolonged-qtc'
ON CONFLICT(case_id, concept_id) DO UPDATE SET role = 'secondary';
DELETE FROM case_concepts
WHERE case_id = '${hypocalcemiaCaseId}' AND concept_id = '${cardiologyId}';
`;

export const verificationSql = `
SELECT c.name, c.slug, parent.name AS parent_name, c.is_active
FROM concepts c
LEFT JOIN concepts parent ON parent.id = c.parent_id
WHERE c.slug IN ('electrolyte-disorders', 'hypercalcemia', 'hypocalcemia', 'ecg-findings', 'short-qtc', 'prolonged-qtc')
ORDER BY COALESCE(parent.name, c.name), parent.name IS NOT NULL, c.name;

SELECT ca.id AS case_id, ca.title AS case_title, c.name AS topic_name, c.slug AS topic_slug, cc.role
FROM cases ca
JOIN case_concepts cc ON cc.case_id = ca.id
JOIN concepts c ON c.id = cc.concept_id
WHERE ca.id IN ('${hypercalcemiaCaseId}', '${hypocalcemiaCaseId}')
ORDER BY ca.id, CASE cc.role WHEN 'primary' THEN 0 ELSE 1 END, c.name;

SELECT ca.id AS unexpected_direct_cardiology_route
FROM cases ca
JOIN case_concepts cc ON cc.case_id = ca.id
WHERE ca.id IN ('${hypercalcemiaCaseId}', '${hypocalcemiaCaseId}')
  AND cc.concept_id = '${cardiologyId}';
`;

export const postconditionSql = `
SELECT
  (SELECT COUNT(*) FROM concepts
   WHERE slug = 'electrolyte-disorders' AND name = 'Electrolyte Disorders' AND parent_id IS NULL AND is_active = 1) AS electrolyte_disorders_ok,
  (SELECT COUNT(*) FROM concepts
   WHERE slug = 'hypercalcemia' AND name = 'Hypercalcemia' AND is_active = 1
     AND parent_id = (SELECT id FROM concepts WHERE slug = 'electrolyte-disorders')) AS hypercalcemia_topic_ok,
  (SELECT COUNT(*) FROM concepts
   WHERE slug = 'hypocalcemia' AND name = 'Hypocalcemia' AND is_active = 1
     AND parent_id = (SELECT id FROM concepts WHERE slug = 'electrolyte-disorders')) AS hypocalcemia_topic_ok,
  (SELECT COUNT(*) FROM concepts
   WHERE slug = 'ecg-findings' AND name = 'ECG Findings' AND parent_id = '${cardiologyId}' AND is_active = 1) AS ecg_findings_ok,
  (SELECT COUNT(*) FROM concepts
   WHERE slug = 'short-qtc' AND name = 'Short QTc' AND is_active = 1
     AND parent_id = (SELECT id FROM concepts WHERE slug = 'ecg-findings')) AS short_qtc_ok,
  (SELECT COUNT(*) FROM concepts
   WHERE slug = 'prolonged-qtc' AND name = 'Prolonged QTc' AND is_active = 1
     AND parent_id = (SELECT id FROM concepts WHERE slug = 'ecg-findings')) AS prolonged_qtc_ok,
  (SELECT COUNT(*) FROM case_concepts
   WHERE case_id = '${hypercalcemiaCaseId}' AND role = 'primary') AS hypercalcemia_primary_count,
  (SELECT COUNT(*) FROM case_concepts cc JOIN concepts c ON c.id = cc.concept_id
   WHERE cc.case_id = '${hypercalcemiaCaseId}' AND cc.role = 'primary' AND c.slug = 'hypercalcemia') AS hypercalcemia_primary_ok,
  (SELECT COUNT(*) FROM case_concepts cc JOIN concepts c ON c.id = cc.concept_id
   WHERE cc.case_id = '${hypercalcemiaCaseId}' AND cc.role = 'secondary' AND c.slug = 'short-qtc') AS hypercalcemia_short_qtc_ok,
  (SELECT COUNT(*) FROM case_concepts
   WHERE case_id = '${hypocalcemiaCaseId}' AND role = 'primary') AS hypocalcemia_primary_count,
  (SELECT COUNT(*) FROM case_concepts cc JOIN concepts c ON c.id = cc.concept_id
   WHERE cc.case_id = '${hypocalcemiaCaseId}' AND cc.role = 'primary' AND c.slug = 'hypocalcemia') AS hypocalcemia_primary_ok,
  (SELECT COUNT(*) FROM case_concepts cc JOIN concepts c ON c.id = cc.concept_id
   WHERE cc.case_id = '${hypocalcemiaCaseId}' AND cc.role = 'secondary' AND c.slug = 'prolonged-qtc') AS hypocalcemia_prolonged_qtc_ok,
  (SELECT COUNT(*) FROM case_concepts
   WHERE case_id IN ('${hypercalcemiaCaseId}', '${hypocalcemiaCaseId}')
     AND concept_id = '${cardiologyId}') AS direct_cardiology_routes;
`;

/** @param {Record<string, unknown>} row */
export function assertPreconditions(row) {
  const failures = [];
  if (Number(row.cardiology_ok) !== 1) failures.push('the known Cardiology Topic ID is missing, inactive, or no longer identifies Cardiology');
  if (Number(row.hypercalcemia_case_ok) !== 1) failures.push('the known Hypercalcemia Case is missing or inactive');
  if (Number(row.hypocalcemia_case_ok) !== 1) failures.push('the known Hypocalcemia Case is missing or inactive');
  if (Number(row.hypercalcemia_primary_count) !== 1 || Number(row.hypercalcemia_primary_allowed) !== 1) failures.push('the Hypercalcemia Case no longer has exactly one allowed primary route (Cardiology or Hypercalcemia)');
  if (Number(row.hypocalcemia_primary_count) !== 1 || Number(row.hypocalcemia_primary_allowed) !== 1) failures.push('the Hypocalcemia Case no longer has exactly one allowed primary route (Cardiology or Hypocalcemia)');
  if (Number(row.reserved_id_collisions) !== 0) failures.push('one or more reserved Topic IDs are occupied by unrelated slugs');
  if (failures.length) throw new Error(`Production taxonomy precondition failed: ${failures.join('; ')}. Re-run the read-only snapshot and review the operator before applying.`);
}

/** @param {Record<string, unknown>} row */
export function assertPostconditions(row) {
  const oneChecks = [
    ['electrolyte_disorders_ok', 'Electrolyte Disorders hierarchy'],
    ['hypercalcemia_topic_ok', 'Hypercalcemia Topic hierarchy'],
    ['hypocalcemia_topic_ok', 'Hypocalcemia Topic hierarchy'],
    ['ecg_findings_ok', 'ECG Findings hierarchy'],
    ['short_qtc_ok', 'Short QTc hierarchy'],
    ['prolonged_qtc_ok', 'Prolonged QTc hierarchy'],
    ['hypercalcemia_primary_count', 'Hypercalcemia primary Topic count'],
    ['hypercalcemia_primary_ok', 'Hypercalcemia primary route'],
    ['hypercalcemia_short_qtc_ok', 'Hypercalcemia Short QTc secondary route'],
    ['hypocalcemia_primary_count', 'Hypocalcemia primary Topic count'],
    ['hypocalcemia_primary_ok', 'Hypocalcemia primary route'],
    ['hypocalcemia_prolonged_qtc_ok', 'Hypocalcemia Prolonged QTc secondary route']
  ];
  const failures = oneChecks.filter(([key]) => Number(row[key]) !== 1).map(([, label]) => label);
  if (Number(row.direct_cardiology_routes) !== 0) failures.push('direct Cardiology routes were not removed');
  if (failures.length) throw new Error(`Production taxonomy postcondition failed: ${failures.join('; ')}. Stop further mutation and run the read-only snapshot.`);
}

/** @param {unknown} payload */
function firstResultRow(payload) {
  if (!Array.isArray(payload) || payload.length !== 1 || !payload[0] || typeof payload[0] !== 'object') {
    throw new Error('Unexpected Wrangler JSON result shape.');
  }
  const result = /** @type {{ success?: boolean, results?: unknown[] }} */ (payload[0]);
  if (result.success !== true || !Array.isArray(result.results) || !result.results[0] || typeof result.results[0] !== 'object') {
    throw new Error('Wrangler did not return the expected successful assertion row.');
  }
  return /** @type {Record<string, unknown>} */ (result.results[0]);
}

const wranglerBin = resolve('node_modules/wrangler/bin/wrangler.js');

/** @param {string} label @param {string} sql @param {{ accountId: string, apiToken: string }} auth */
function execute(label, sql, auth) {
  console.log(`\n== ${label} ==`);
  execFileSync(process.execPath, [
    wranglerBin,
    'd1',
    'execute',
    'DB',
    '--remote',
    '--json',
    '--command',
    sql
  ], {
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: auth.accountId, CLOUDFLARE_API_TOKEN: auth.apiToken },
    stdio: 'inherit'
  });
}

/** @param {string} label @param {string} sql @param {{ accountId: string, apiToken: string }} auth */
function executeAssertion(label, sql, auth) {
  console.log(`\n== ${label} ==`);
  const output = execFileSync(process.execPath, [
    wranglerBin,
    'd1',
    'execute',
    'DB',
    '--remote',
    '--json',
    '--command',
    sql
  ], {
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: auth.accountId, CLOUDFLARE_API_TOKEN: auth.apiToken },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit']
  });
  process.stdout.write(output.endsWith('\n') ? output : `${output}\n`);
  return firstResultRow(JSON.parse(output));
}

/** @param {string[]} argv */
export function parseMode(argv) {
  const args = new Set(argv);
  const apply = args.has('--apply');
  const dryRun = args.has('--dry-run');
  if (args.size !== 1 || (!apply && !dryRun)) {
    throw new Error('Usage: node scripts/apply-agreed-taxonomy.mjs --dry-run|--apply');
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
  console.log('Agreed production taxonomy operator');
  console.log(`Mode: ${mode.apply ? 'APPLY' : 'DRY RUN'}`);
  console.log('Scope: six agreed Topics and two known Case route sets only.');
  console.log('Credential values are not printed.');
  execute('PRE-FLIGHT / CURRENT TARGET STATE', preflightSql, auth);
  const preconditions = executeAssertion('PRE-FLIGHT / MACHINE SAFETY CHECKS', preconditionSql, auth);
  assertPreconditions(preconditions);
  console.log('Pre-flight machine safety checks passed.');

  if (mode.dryRun) {
    console.log('\nDry run complete. No production mutation was attempted.');
    return;
  }

  execute('APPLY / D1 BATCH TAXONOMY UPDATE', mutationSql, auth);
  execute('POST-FLIGHT / EXPECTED TAXONOMY AND ROUTES', verificationSql, auth);
  const postconditions = executeAssertion('POST-FLIGHT / MACHINE VERIFICATION', postconditionSql, auth);
  assertPostconditions(postconditions);
  console.log('\nProduction taxonomy update and machine verification completed.');
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isDirectRun) main();
