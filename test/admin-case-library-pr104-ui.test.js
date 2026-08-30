import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../src/routes/admin/cases/+page.svelte', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../src/routes/admin/cases/+page.server.js', import.meta.url), 'utf8');
const creatorSource = readFileSync(new URL('../src/lib/components/case-library/CaseLibraryTopicCreator.svelte', import.meta.url), 'utf8');
const bulkTagSource = readFileSync(new URL('../src/lib/components/case-library/BulkCaseTagEditor.svelte', import.meta.url), 'utf8');
const classificationSource = readFileSync(new URL('../src/lib/components/case-library/CaseClassificationEditor.svelte', import.meta.url), 'utf8');
const classificationEndpointSource = readFileSync(new URL('../src/routes/admin/cases/[caseId]/classification/+server.js', import.meta.url), 'utf8');

test('Case Library keeps deliberate search and native browser state restoration', () => {
  for (const id of ['case-search', 'topic-search', 'system-search']) {
    const input = pageSource.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`))?.[0] ?? '';
    assert.ok(input, `expected ${id}`);
    assert.doesNotMatch(input, /oninput=|onkeyup=|onkeydown=/, `${id} must not persist/navigate on each keystroke`);
  }
  assert.match(pageSource, /shouldRestoreCaseLibraryState\(params, Boolean\(form\)\)/);
  assert.match(pageSource, /readCaseLibraryStoredState\(\)/);
  assert.match(pageSource, /window\.location\.replace\(href\)/);
  assert.match(pageSource, /writeCaseLibraryStoredState\(currentStoredState\(\)\)/);
  assert.match(pageSource, /clearCaseLibraryStoredState\(\)/);
  assert.doesNotMatch(pageSource, /history\.(pushState|replaceState)/, 'browser Back/Forward must remain native');
});

test('pagination, sort, lifecycle and named mutations stay wired through the Case Library state helpers', () => {
  assert.match(pageSource, /caseLibraryStateHref\(\{ \.\.\.currentStoredState\(\), page \}, \['page'\]\)/);
  assert.match(pageSource, /caseLibraryStateHref\(\{ \.\.\.currentStoredState\(\), sort: `\$\{column\}-\$\{direction\}`, page: 1 \}, \['sort'\]\)/);
  assert.match(pageSource, /caseLibraryStateHref\(\{ \.\.\.currentStoredState\(\), lifecycle, page: 1 \}, \['lifecycle'\]\)/);
  assert.match(pageSource, /caseLibraryNamedActionHref\(actionName, currentQuery\(\)\)/);
  assert.match(pageSource, /actionQuery=\{currentQuery\(\)\}/);
  assert.match(creatorSource, /caseLibraryNamedActionHref\('createCaseLibraryTopic', actionQuery\)/);
  assert.match(bulkTagSource, /caseLibraryNamedActionHref\('bulkAddCaseTag', effectiveActionQuery\)/);
  assert.match(bulkTagSource, /caseLibraryNamedActionHref\('bulkRemoveCaseTag', effectiveActionQuery\)/);
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

test('bulk Topic assignment and global Topic move remain separate required workflows for the selected Cases', () => {
  assert.match(pageSource, /id="bulk-topic-assignment-form"[\s\S]*action=\{actionHref\('bulkPromoteTopic'\)\}/);
  assert.match(pageSource, /id="bulk-topic-system-move-form"[\s\S]*action=\{actionHref\('bulkMoveCaseTopicsToSystem'\)\}/);
  assert.match(pageSource, /name="concept_id" form="bulk-topic-assignment-form" required/);
  assert.match(pageSource, /name="system_id" form="bulk-topic-system-move-form" required/);
  assert.match(pageSource, /\{#each selectedCaseIds as caseId\}<input type="hidden" name="case_ids" value=\{caseId\}/);
  assert.doesNotMatch(pageSource, /Move Topics globally<\/button>[\s\S]{0,120}formnovalidate|formnovalidate[^>]*>Move Topics globally/);
});

test('failed Topic creation and normal navigation reconcile selection through the shared selection model', () => {
  assert.match(creatorSource, /name="topic_case_ids" value=\{caseId\}/);
  assert.match(serverSource, /topicSelectedCaseIds: caseIds/);
  assert.match(pageSource, /failedTopicSelection\(form\)/);
  assert.match(pageSource, /reconcileVisibleCaseSelection\(\{[\s\S]*visibleIds/);
  assert.match(pageSource, /selectedCaseIds = \$state\(failedSelection\.selectedIds\)/);
  assert.match(pageSource, /retryRequiresSelection=\{topicCreationRetryRequiresSelection\}/);
  assert.match(creatorSource, /retryRequiresSelection && !selectedCount/);
  assert.match(pageSource, /if \(reconciled\.removedCount\) selectedCaseIds = reconciled\.selectedIds/);
  assert.match(pageSource, /if \(selectionAnchorId && !visibleIds\.includes\(selectionAnchorId\)\) selectionAnchorId = null/);
});

test('Case Library classification UI stays editable only for active Cases and keeps global hierarchy changes explicit', () => {
  assert.match(pageSource, /CaseClassificationEditor/);
  assert.match(pageSource, /\{#if inactiveView\}<span>\{item\.conceptName \?\? 'Unassigned'\}<\/span>\{:else\}<div class="classification-cell">/);
  assert.match(classificationSource, />Edit classification<\/button>/);
  assert.match(classificationSource, /role="dialog" aria-label=\{`Edit classification for \$\{caseTitle\}`\}/);
  assert.match(classificationSource, /filterCaseLibraryTopicsBySystem\(topics, nextContext\)/);
  assert.match(classificationSource, /selectedTopicId = ''/);
  assert.match(classificationSource, /Filters Topic choices only; it does not change taxonomy hierarchy/);
  assert.match(classificationSource, /Move Topic to System/);
  assert.match(classificationSource, /move-topic-to-system/);
  assert.match(classificationEndpointSource, /promoteCaseTopic\(db, \{ caseId, conceptId:/);
  assert.match(classificationEndpointSource, /createCaseLibraryTopic\(db, \{/);
  assert.match(classificationSource, /global hierarchy change:[\s\S]*every Case using this Topic[\s\S]*descendant Topic subtree/);
  assert.match(pageSource, /affects every Case using those shared Topics[\s\S]*descendant Topic subtrees/);
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
