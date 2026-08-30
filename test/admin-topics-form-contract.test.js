import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const topicsPage = readFileSync(new URL('../src/routes/admin/topics/+page.svelte', import.meta.url), 'utf8');
const organizer = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyOrganizer.svelte', import.meta.url), 'utf8');
const topicsAction = readFileSync(new URL('../src/routes/admin/topics/+page.server.js', import.meta.url), 'utf8');
const taxonomyWrite = readFileSync(new URL('../src/lib/server/db/taxonomy-admin-write.ts', import.meta.url), 'utf8');
const caseTopics = readFileSync(new URL('../src/lib/components/case-editor/CaseTopicsSection.svelte', import.meta.url), 'utf8');
const caseAction = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');

test('Topic creation supports searchable active System or Topic parents while System creation remains top-level', () => {
  assert.match(organizer, /onclick=\{\(\) => openCreate\('system'\)\}>\+ New System/);
  assert.match(organizer, /onclick=\{\(\) => openCreate\('topic'\)\}>\+ New Topic/);
  assert.match(organizer, /bind:value=\{createKind\}/);
  assert.match(organizer, /\{#if createKind === 'topic'\}/);
  assert.match(organizer, /SearchableTaxonomyPicker bind:value=\{createParentId\}/);
  assert.match(organizer, /name="parent_id" value=\{createParentId\}/);
  assert.match(organizer, /\{:else\}<input type="hidden" name="parent_id" value="" \/>\{\/if\}/);
  assert.match(organizer, /emptyLabel="Unassigned"/);
  assert.match(organizer, /item\.kind === 'system' \? 'System' : 'Topic'/);
  assert.match(organizer, /\+ Add Topic/);
  assert.match(organizer, /\+ Add subtopic/);
});

test('Systems and Topics route delegates the visual taxonomy to one organizer without retired Additional Study Topic authoring', () => {
  assert.equal([...topicsPage.matchAll(/<TaxonomyOrganizer\b/g)].length, 1);
  assert.doesNotMatch(topicsPage, /Additional Study Topic/);
});

test('System creation always submits a null parent to the taxonomy writer', () => {
  const createConceptAction = topicsAction.match(/createConcept:\s*async[\s\S]*?\n  },\n\n  updateConcept:/);
  assert.ok(createConceptAction, 'Expected the Systems and Topics route to define createConcept before updateConcept.');
  assert.match(createConceptAction[0], /parentId:\s*formText\(formData, 'parent_id'\)/);
  assert.match(taxonomyWrite, /const parentId = kind === 'system' \? null : optionalText\(input\.parentId\)/);
});

test('Case editor can place its current Primary Topic under an active System', () => {
  assert.match(caseTopics, /action="\?\/assignPrimaryTopicToSystem"/);
  assert.match(caseTopics, /name="topic_id" value=\{primaryTopic\.id\}/);
  assert.match(caseTopics, /<label>Parent System<select name="system_id"/);
  assert.match(caseAction, /assignPrimaryTopicToSystem:\s*async/);
});
