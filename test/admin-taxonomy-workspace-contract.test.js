import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyWorkspace.svelte', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyInspector.svelte', import.meta.url), 'utf8');
const changeTray = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyChangeTray.svelte', import.meta.url), 'utf8');
const readModel = readFileSync(new URL('../src/lib/server/db/taxonomy-admin-read.ts', import.meta.url), 'utf8');
const hierarchyStaging = readFileSync(new URL('../src/lib/server/db/taxonomy-hierarchy-staging.ts', import.meta.url), 'utf8');
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
  assert.match(workspace, /draggable="true"/);
  assert.match(workspace, /Move to…/);
  assert.match(workspace, /Drop here → Unassigned Topics/);
  assert.match(workspace, /stageTopicMove/);
  assert.doesNotMatch(workspace, /fetch\([^\n]*applyHierarchy/);
});

test('staged hierarchy tray reviews original parents and submits only through Validate and apply', () => {
  assert.match(changeTray, /Staged changes/);
  assert.match(changeTray, /expectedParentId: move\.originalParentId/);
  assert.match(changeTray, /name="changes_json"/);
  assert.match(changeTray, /action="\?\/applyHierarchy"/);
  assert.match(changeTray, /use:enhance/);
  assert.match(changeTray, /Validate &amp; apply/);
  assert.match(topicsAction, /applyStagedTaxonomyHierarchy/);
});

test('server staging checks loaded parent state before delegating to canonical hierarchy validation and writes', () => {
  assert.match(hierarchyStaging, /changed since this workspace was loaded/);
  const staleCheck = hierarchyStaging.indexOf('currentById.get(change.id) !== change.expectedParentId');
  const canonicalApply = hierarchyStaging.indexOf('await applyTaxonomyHierarchy');
  assert.ok(staleCheck >= 0);
  assert.ok(canonicalApply > staleCheck);
});
