import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../src/routes/admin/cases/+page.svelte', import.meta.url), 'utf8');
const creatorSource = readFileSync(new URL('../src/lib/components/case-library/CaseLibraryTopicCreator.svelte', import.meta.url), 'utf8');
const classificationSource = readFileSync(new URL('../src/lib/components/case-library/CaseClassificationEditor.svelte', import.meta.url), 'utf8');

test('Case Library keeps deliberate search and native browser navigation wiring', () => {
  for (const id of ['case-search', 'topic-search', 'system-search']) {
    const input = pageSource.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
    assert.ok(input, `expected ${id}`);
    assert.doesNotMatch(input, /oninput=|onkeyup=|onkeydown=/, `${id} must not persist/navigate on each keystroke`);
  }
  assert.match(pageSource, /shouldRestoreCaseLibraryState\(params, Boolean\(form\)\)/);
  assert.match(pageSource, /readCaseLibraryStoredState\(\)/);
  assert.match(pageSource, /writeCaseLibraryStoredState\(currentStoredState\(\)\)/);
  assert.match(pageSource, /clearCaseLibraryStoredState\(\)/);
  assert.doesNotMatch(pageSource, /history\.(pushState|replaceState)/, 'browser Back/Forward must remain native');
});

test('active Case Library keeps the intended quick-authoring and bulk-action surfaces', () => {
  assert.match(pageSource, /CaseLibraryTopicCreator/);
  assert.match(pageSource, />Assign Topic<\/button>/);
  assert.match(pageSource, /BulkCaseTagEditor/);
  assert.match(pageSource, />Deactivate selected<\/button>/);
  assert.match(creatorSource, />New Topic<\/button>/);
  assert.match(creatorSource, /<option value="">Unassigned<\/option>/);
  assert.match(creatorSource, /optgroup label="Systems"/);
  assert.match(creatorSource, /optgroup label="Topics"/);
  assert.match(creatorSource, /Create & assign to \$\{selectedCount\}/);
});

test('Case Library classification UI stays editable only for active Cases and makes global hierarchy moves explicit', () => {
  assert.match(pageSource, /CaseClassificationEditor/);
  assert.match(pageSource, /\{#if inactiveView\}<span>\{item\.conceptName \?\? 'Unassigned'\}<\/span>\{:else\}<div class="classification-cell">/);
  assert.match(classificationSource, />Edit classification<\/button>/);
  assert.match(classificationSource, /role="dialog" aria-label=\{`Edit classification for \$\{caseTitle\}`\}/);
  assert.match(classificationSource, /filterCaseLibraryTopicsBySystem\(topics, nextContext\)/);
  assert.match(classificationSource, /selectedTopicId = ''/);
  assert.match(classificationSource, /Filters Topic choices only; it does not change taxonomy hierarchy/);
  assert.match(classificationSource, /Move Topic to System/);
  assert.match(classificationSource, /global hierarchy change:[\s\S]*every Case using this Topic[\s\S]*descendant Topic subtree/);
});

test('active and inactive bulk actions use one mutually-exclusive sticky toolbar with narrow-screen wrapping', () => {
  assert.equal((pageSource.match(/class="bulk-toolbar"/g) ?? []).length, 2, 'active and inactive branches each define their one runtime toolbar');
  assert.match(pageSource, /\{#if inactiveView\}[\s\S]*class="bulk-toolbar"[\s\S]*\{:else\}[\s\S]*class="bulk-toolbar"/);
  assert.doesNotMatch(pageSource, /bulk-toolbar-clone|floating-bulk-toolbar/);
  assert.match(pageSource, /\.bulk-toolbar \{[^}]*position: sticky;[^}]*top: 0\.75rem;[^}]*z-index: 12;/);
  assert.match(pageSource, /\.bulk-toolbar \{[^}]*flex-wrap: wrap;/);
  assert.match(pageSource, /@media \(max-width: 600px\)[\s\S]*\.bulk-topic, \.bulk-system \{ min-width: 100%; \}/);
  assert.match(pageSource, />Restore selected<\/button>/);
  assert.match(pageSource, /disabled=\{!selectedCaseIds\.length\}/);
});