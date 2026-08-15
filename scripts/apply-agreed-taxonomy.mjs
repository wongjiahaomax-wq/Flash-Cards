#!/usr/bin/env node

import { execFileSync } from 'node:child_process';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const dryRun = args.has('--dry-run');

if (args.size !== 1 || (!apply && !dryRun)) {
  console.error('Usage: node scripts/apply-agreed-taxonomy.mjs --dry-run|--apply');
  process.exit(2);
}

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
const apiToken = process.env.CLOUDFLARE_API_TOKEN;
if (!accountId || !apiToken) {
  console.error('CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN are required.');
  process.exit(2);
}

const cardiologyId = '65862404-8493-408c-8de7-ccf385209924';
const hypercalcemiaCaseId = 'b1f4870e-52fe-4d26-bbea-851ec64357a7';
const hypocalcemiaCaseId = 'b11b6a14-c55e-4d70-849c-ce1c8953a38f';

// These IDs are only used when a Topic with the agreed slug does not already
// exist. Existing rows are reused by slug. A collision with an unrelated row
// using one of these reserved IDs aborts the transaction rather than changing
// that row.
const topicIds = {
  electrolyteDisorders: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f01',
  hypercalcemia: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f02',
  hypocalcemia: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f03',
  ecgFindings: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f04',
  shortQtc: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f05',
  prolongedQtc: '9f9cc6e7-17d7-4e16-9ea0-8a2a9b2a8f06'
};

const preflightSql = `
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

const mutationSql = `
BEGIN IMMEDIATE;

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

COMMIT;
`;

const verificationSql = `
SELECT c.name, c.slug, parent.name AS parent_name, c.is_active
FROM concepts c
LEFT JOIN concepts parent ON parent.id = c.parent_id
WHERE c.slug IN ('electrolyte-disorders', 'hypercalcemia', 'hypocalcemia', 'ecg-findings', 'short-qtc', 'prolonged-qtc')
ORDER BY COALESCE(parent.name, c.name), parent.name IS NOT NULL, c.name;

SELECT ca.title AS case_title, c.name AS topic_name, cc.role
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

function execute(label, sql) {
  console.log(`\n== ${label} ==`);
  execFileSync('npx', [
    '--yes',
    'wrangler@4.123.0',
    'd1',
    'execute',
    'DB',
    '--remote',
    '--json',
    '--command',
    sql
  ], {
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken },
    stdio: 'inherit'
  });
}

console.log('Agreed production taxonomy operator');
console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`);
console.log('Scope: six agreed Topics and two known Case route sets only.');
console.log('Credential values are not printed.');
execute('PRE-FLIGHT / CURRENT TARGET STATE', preflightSql);

if (dryRun) {
  console.log('\nDry run complete. No production mutation was attempted.');
  process.exit(0);
}

execute('APPLY / TRANSACTIONAL TAXONOMY UPDATE', mutationSql);
execute('POST-FLIGHT / EXPECTED TAXONOMY AND ROUTES', verificationSql);
console.log('\nProduction taxonomy update and read-back verification completed.');
