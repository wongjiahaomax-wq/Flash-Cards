import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyWorkspace.svelte', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyInspector.svelte', import.meta.url), 'utf8');
const readModel = readFileSync(new URL('../src/lib/server/db/taxonomy-admin-read.ts', import.meta.url), 'utf8');

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
