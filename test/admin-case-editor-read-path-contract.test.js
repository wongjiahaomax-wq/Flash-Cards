import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageServer = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
const page = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.svelte', import.meta.url), 'utf8');
const topicsSection = readFileSync(new URL('../src/lib/components/case-editor/CaseTopicsSection.svelte', import.meta.url), 'utf8');
const caseTagsEndpoint = readFileSync(new URL('../src/routes/admin/cases/[caseId]/case-tags/+server.js', import.meta.url), 'utf8');

test('Production Case editor loads selector data from one taxonomy source plus lightweight Tag options', () => {
  assert.match(pageServer, /listCaseEditorTaxonomyOptions\(db\)/);
  assert.doesNotMatch(pageServer, /\blistAdminConcepts\(db\)/);
  assert.doesNotMatch(pageServer, /\blistActiveSystems\(db\)/);
  assert.match(pageServer, /listActiveTagOptions\(db\)/);
  assert.match(pageServer, /selectedCase:\s*\{[^}]*\btagOptions\b/s);
  assert.match(page, /<CaseTopicsSection\b[^>]*tagOptions=\{selectedCase\.tagOptions \?\? \[\]\}/s);
});

test('CaseTopicsSection consumes supplied Tag options without a mounted Tag-options GET', () => {
  assert.doesNotMatch(topicsSection, /\bonMount\s*\(/);
  assert.doesNotMatch(topicsSection, /\bfetch\s*\(/);
  assert.doesNotMatch(topicsSection, /loadedTagOptions|effectiveTagOptions/);
  assert.match(topicsSection, /tagOptions\.some\(/);
  assert.match(topicsSection, /\{#each tagOptions as tag\}/);
});

test('Case Tag assignments and server-authoritative mutation contracts remain in place', () => {
  assert.match(topicsSection, /\{#each selectedCase\.caseTags as tag\}/);
  for (const operation of ['add', 'remove', 'create-and-add']) {
    assert.match(topicsSection, new RegExp(`name=["']operation["'] value=["']${operation}["']`));
  }
  assert.match(caseTagsEndpoint, /export async function GET\b/);
  assert.match(caseTagsEndpoint, /export async function POST\b/);
  assert.match(caseTagsEndpoint, /await addCaseTag\(/);
  assert.match(caseTagsEndpoint, /await removeCaseTag\(/);
  assert.match(caseTagsEndpoint, /await createAndAddCaseTag\(/);
});
