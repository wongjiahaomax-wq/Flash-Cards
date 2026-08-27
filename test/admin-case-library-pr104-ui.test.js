import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../src/routes/admin/cases/+page.svelte', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../src/routes/admin/cases/+page.server.js', import.meta.url), 'utf8');
const creatorSource = readFileSync(new URL('../src/lib/components/case-library/CaseLibraryTopicCreator.svelte', import.meta.url), 'utf8');

test('Case Library keeps deliberate search while persisting server-normalized state only after navigation', () => {
  for (const id of ['case-search', 'topic-search', 'system-search']) {
    const input = pageSource.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
    assert.ok(input, `expected ${id}`);
    assert.doesNotMatch(input, /oninput=|onkeyup=|onkeydown=/, `${id} must not persist/navigate on each keystroke`);
  }
  assert.match(pageSource, /hasExplicitCaseLibraryQuery\(params\)/);
  assert.match(pageSource, /readCaseLibraryStoredState\(\)/);
  assert.match(pageSource, /window\.location\.replace\(href\)/);
  assert.match(pageSource, /writeCaseLibraryStoredState\(currentStoredState\(\)\)/);
  assert.match(pageSource, /clearCaseLibraryStoredState\(\)/);
  assert.match(pageSource, /placeholder="e\.g\. Cardiology or Unassigned"/);
  assert.doesNotMatch(pageSource, /history\.(pushState|replaceState)/, 'browser Back/Forward must remain native');
});

test('active Case Library exposes quick Topic creation without replacing existing bulk actions', () => {
  assert.match(pageSource, /CaseLibraryTopicCreator/);
  assert.match(pageSource, />Assign Topic<\/button>/);
  assert.match(pageSource, /BulkCaseTagEditor/);
  assert.match(pageSource, />Deactivate selected<\/button>/);
  assert.match(creatorSource, />New Topic<\/button>/);
  assert.match(creatorSource, /<option value="">Unassigned<\/option>/);
  assert.match(creatorSource, /optgroup label="Systems"/);
  assert.match(creatorSource, /optgroup label="Topics"/);
  assert.match(creatorSource, /formaction="\?\/createCaseLibraryTopic"/);
  assert.match(creatorSource, /Create & assign to \$\{selectedCount\}/);
});

test('Case Library route reuses the page taxonomy model for Topic parent options and rejects inactive quick creation', () => {
  assert.match(serverSource, /topicParents:\s*pageData\.topicParentOptions/);
  assert.match(serverSource, /createCaseLibraryTopic:/);
  assert.match(serverSource, /Create Topics from the active Case Library/);
  assert.doesNotMatch(serverSource, /listAdminConcepts|listActiveSystems/);
});
