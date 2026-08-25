import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const topicsPage = readFileSync(new URL('../src/routes/admin/topics/+page.svelte', import.meta.url), 'utf8');
const topicsAction = readFileSync(new URL('../src/routes/admin/topics/+page.server.js', import.meta.url), 'utf8');
const taxonomyWrite = readFileSync(new URL('../src/lib/server/db/taxonomy-admin-write.ts', import.meta.url), 'utf8');
const caseTopics = readFileSync(new URL('../src/lib/components/case-editor/CaseTopicsSection.svelte', import.meta.url), 'utf8');
const caseAction = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');

test('System creation hides the parent control while Topic creation exposes Parent System', () => {
  assert.match(topicsPage, /bind:value=\{createKind\}/);
  assert.match(topicsPage, /\{#if createKind === 'topic'\}/);
  assert.match(topicsPage, /<label>Parent System<select name="parent_id">/);
  assert.match(topicsPage, /item\.kind === 'system' && item\.isActive/);
  assert.match(topicsPage, /<option value="">Unassigned<\/option>/);
});

test('System creation always submits a null parent to the taxonomy writer', () => {
  assert.match(topicsAction, /parentId:\s*formText\(formData, 'parent_id'\)/);
  assert.match(taxonomyWrite, /const parentId = kind === 'system' \? null : optionalText\(input\.parentId\)/);
});

test('Case editor can place its current Primary Topic under an active System', () => {
  assert.match(caseTopics, /action="\?\/assignPrimaryTopicToSystem"/);
  assert.match(caseTopics, /name="topic_id" value=\{primaryTopic\.id\}/);
  assert.match(caseTopics, /<label>Parent System<select name="system_id"/);
  assert.match(caseAction, /assignPrimaryTopicToSystem/);
  assert.match(taxonomyWrite, /The selected Topic is not the current Primary Topic for this Case/);
});
