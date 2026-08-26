import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyWorkspace.svelte', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyInspector.svelte', import.meta.url), 'utf8');
const caseInspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/CaseTaxonomyInspector.svelte', import.meta.url), 'utf8');
const changeTray = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyChangeTray.svelte', import.meta.url), 'utf8');
const readModel = readFileSync(new URL('../src/lib/server/db/taxonomy-admin-read.ts', import.meta.url), 'utf8');
const hierarchyStaging = readFileSync(new URL('../src/lib/server/db/taxonomy-hierarchy-staging.ts', import.meta.url), 'utf8');
const caseStaging = readFileSync(new URL('../src/lib/server/db/case-primary-topic-staging.ts', import.meta.url), 'utf8');
const topicsAction = readFileSync(new URL('../src/routes/admin/topics/+page.server.js', import.meta.url), 'utf8');

test('Cases remain hidden by default and revealed rows lead with the human-readable Case title', () => {
  assert.match(workspace, /let revealedTopicIds = \$state<string\[\]>\(\[\]\)/);
  assert.match(workspace, /Show Cases/);
  assert.match(workspace, /class="case-title">\{caseItem\.title\}/);
  assert.match(workspace, /href=\{'\/admin\/cases\/' \+ caseItem\.id\}/);
  assert.match(readModel, /directCasesByTopic/);
  assert.match(readModel, /eq\(caseConcepts\.role, 'primary'\)/);
  assert.match(readModel, /isNull\(cases\.previewSessionId\)/);
});

test('Topic inspector distinguishes direct Cases from descendant Cases and keeps structural actions explicit', () => {
  assert.match(inspector, />Direct Cases</);
  assert.match(inspector, />Descendant Cases</);
  assert.match(inspector, />Subtopics</);
  assert.match(inspector, /\+ Add subtopic/);
  assert.match(inspector, /Show Cases/);
});

test('tree exposes accessible expanded and selected state instead of relying on indentation alone', () => {
  assert.match(workspace, /role="tree"/);
  assert.match(workspace, /role="treeitem"/);
  assert.match(workspace, /aria-selected=\{selectedId === row\.id\}/);
  assert.match(workspace, /aria-expanded=/);
  assert.match(workspace, /aria-label=\{\(collapsedIds\.includes\(row\.id\) \? 'Expand ' : 'Collapse '\) \+ row\.name\}/);
});

test('Organize mode stages Topic hierarchy changes and keeps a keyboard/mobile Move to fallback', () => {
  assert.match(workspace, /Organize taxonomy &amp; Cases/);
  assert.match(workspace, /const hasCaseClassificationBatch = \$derived\(stagedCaseChanges\.length > 0 \|\| stagedCaseTagChanges\.length > 0\)/);
  assert.match(workspace, /draggable=\{!hasCaseClassificationBatch\}/);
  assert.match(workspace, /Move to…/);
  assert.match(workspace, /Drop here → Unassigned Topics/);
  assert.match(workspace, /stageTopicMove/);
  assert.doesNotMatch(workspace, /fetch\([^\n]*applyHierarchy/);
});

test('Organize mode exposes selectable Cases and a focused classification inspector for single or bulk staging', () => {
  assert.match(workspace, /type="checkbox"/);
  assert.match(workspace, /Select direct Cases/);
  assert.match(workspace, /<CaseTaxonomyInspector/);
  assert.match(workspace, /stageCasePrimaryTopicChanges/);
  assert.match(caseInspector, /Case inspector/);
  assert.match(caseInspector, /Loaded Primary Topic/);
  assert.match(caseInspector, /Projected Primary Topic/);
  assert.match(caseInspector, /Stage Primary Topic change/);
  assert.match(caseInspector, /up to 60 selected Cases/);
  assert.match(caseInspector, /Case Tags/);
  assert.match(caseInspector, /Tags stay separate from the System\/Topic tree/);
  assert.match(caseInspector, /Stage add/);
  assert.match(caseInspector, /Stage remove/);
});

test('staged review tray submits hierarchy, Primary Topic, and Case Tag batches through explicit validated actions', () => {
  assert.match(changeTray, /Staged changes/);
  assert.match(changeTray, /expectedParentId: move\.originalParentId/);
  assert.match(changeTray, /name="changes_json"/);
  assert.match(changeTray, /action="\?\/applyHierarchy"/);
  assert.match(changeTray, /expectedConceptId: change\.originalTopicId/);
  assert.match(changeTray, /name="case_changes_json"/);
  assert.match(changeTray, /action="\?\/applyCasePrimaryTopics"/);
  assert.match(changeTray, /Validate &amp; apply Primary Topics/);
  assert.match(changeTray, /expectedAttached: change\.expectedAttached/);
  assert.match(changeTray, /name="tag_changes_json"/);
  assert.match(changeTray, /action="\?\/applyCaseTags"/);
  assert.match(changeTray, /Validate &amp; apply Case Tags/);
  assert.match(changeTray, /separate mutation domains/);
  assert.match(topicsAction, /applyStagedTaxonomyHierarchy/);
  assert.match(topicsAction, /applyStagedCasePrimaryTopics/);
  assert.match(topicsAction, /applyStagedCaseTags/);
});

test('workspace prevents simultaneous hierarchy, Primary Topic, and Case Tag staging until unified cross-domain apply exists', () => {
  assert.match(workspace, /return !hasCaseClassificationBatch && canStageTopicMove/);
  assert.match(workspace, /if \(stagedMoves\.length \|\| stagedCaseTagChanges\.length\)/);
  assert.match(workspace, /if \(stagedMoves\.length \|\| stagedCaseChanges\.length\)/);
  assert.match(workspace, /Apply or discard the staged hierarchy batch before staging Case Primary Topic changes/);
  assert.match(workspace, /Apply or discard the staged Case Tag batch before staging Case Primary Topic changes/);
  assert.match(workspace, /Apply or discard the staged hierarchy batch before staging Case Tag changes/);
  assert.match(workspace, /Apply or discard the staged Primary Topic batch before staging Case Tag changes/);
  assert.match(workspace, /Apply or discard the Case classification batch before staging Topic moves/);
});

test('server hierarchy staging checks loaded parent state before delegating to canonical hierarchy validation and writes', () => {
  assert.match(hierarchyStaging, /changed since this workspace was loaded/);
  const staleCheck = hierarchyStaging.indexOf('currentById.get(change.id) !== change.expectedParentId');
  const canonicalApply = hierarchyStaging.indexOf('await applyTaxonomyHierarchy');
  assert.ok(staleCheck >= 0);
  assert.ok(canonicalApply > staleCheck);
});

test('server Case staging checks loaded Primary Topic before reusing canonical bulk promotion', () => {
  assert.match(caseStaging, /changed since this workspace was loaded/);
  const staleCheck = caseStaging.indexOf("currentTopics[0] !== change.expectedConceptId");
  const canonicalApply = caseStaging.indexOf('await bulkPromoteCaseTopics');
  assert.ok(staleCheck >= 0);
  assert.ok(canonicalApply > staleCheck);
  assert.match(caseStaging, /new Set\(normalized\.map\(\(change\) => change\.conceptId\)\)\.size !== 1/);
});
