import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const pageSource = readFileSync(new URL('../src/routes/admin/cases/+page.svelte', import.meta.url), 'utf8');
const serverSource = readFileSync(new URL('../src/routes/admin/cases/+page.server.js', import.meta.url), 'utf8');
const creatorSource = readFileSync(new URL('../src/lib/components/case-library/CaseLibraryTopicCreator.svelte', import.meta.url), 'utf8');
const bulkTagSource = readFileSync(new URL('../src/lib/components/case-library/BulkCaseTagEditor.svelte', import.meta.url), 'utf8');
const classificationSource = readFileSync(new URL('../src/lib/components/case-library/CaseClassificationEditor.svelte', import.meta.url), 'utf8');
const classificationEndpointSource = readFileSync(new URL('../src/routes/admin/cases/[caseId]/classification/+server.js', import.meta.url), 'utf8');
const adminContentSource = readFileSync(new URL('../src/lib/server/db/admin-content.js', import.meta.url), 'utf8');

test('Case Library keeps deliberate search while persisting server-normalized state only after navigation', () => {
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
  assert.match(pageSource, /placeholder="e\.g\. Cardiology or Unassigned"/);
  assert.doesNotMatch(pageSource, /history\.(pushState|replaceState)/, 'browser Back/Forward must remain native');
});

test('deliberate default pagination, sort, and lifecycle links remain explicit', () => {
  assert.match(pageSource, /caseLibraryStateHref\(\{ \.\.\.currentStoredState\(\), page \}, \['page'\]\)/);
  assert.match(pageSource, /caseLibraryStateHref\(\{ \.\.\.currentStoredState\(\), sort: `\$\{column\}-\$\{direction\}`, page: 1 \}, \['sort'\]\)/);
  assert.match(pageSource, /caseLibraryStateHref\(\{ \.\.\.currentStoredState\(\), lifecycle, page: 1 \}, \['lifecycle'\]\)/);
});

test('named mutation targets retain the current Case Library query and failed form data blocks restoration', () => {
  assert.match(pageSource, /caseLibraryNamedActionHref\(actionName, currentQuery\(\)\)/);
  assert.match(pageSource, /action=\{actionHref\(inactiveView \? 'bulkRestoreCases' : 'bulkDeactivateCases'\)\}/);
  assert.match(pageSource, /action=\{actionHref\('bulkPromoteTopic'\)\}/);
  assert.match(pageSource, /action=\{actionHref\('bulkMoveCaseTopicsToSystem'\)\}/);
  assert.match(pageSource, /actionQuery=\{currentQuery\(\)\}/);
  assert.match(creatorSource, /caseLibraryNamedActionHref\('createCaseLibraryTopic', actionQuery\)/);
  assert.match(bulkTagSource, /actionQuery \|\| caseLibraryReturnQuery\(page\.url\.searchParams\)/);
});

test('active Case Library exposes quick Topic creation without replacing existing bulk actions', () => {
  assert.match(pageSource, /CaseLibraryTopicCreator/);
  assert.match(pageSource, />Assign Topic<\/button>/);
  assert.match(pageSource, /BulkCaseTagEditor/);
  assert.match(pageSource, />Deactivate selected<\/button>/);
  assert.match(creatorSource, />New Topic<\/button>/);
  assert.match(creatorSource, /Create & assign/);
});

test('bulk Topic assignment and global Topic move use independent required controls and selected Case payloads', () => {
  assert.match(pageSource, /id="bulk-topic-assignment-form"[\s\S]*action=\{actionHref\('bulkPromoteTopic'\)\}/);
  assert.match(pageSource, /id="bulk-topic-system-move-form"[\s\S]*action=\{actionHref\('bulkMoveCaseTopicsToSystem'\)\}/);
  assert.match(pageSource, /name="concept_id" form="bulk-topic-assignment-form" required/);
  assert.match(pageSource, /form="bulk-topic-assignment-form"[^>]*>Assign Topic<\/button>/);
  assert.match(pageSource, /name="system_id" form="bulk-topic-system-move-form" required/);
  assert.match(pageSource, /form="bulk-topic-system-move-form"[^>]*>Move Topics globally<\/button>/);
  assert.match(pageSource, /\{#each selectedCaseIds as caseId\}<input type="hidden" name="case_ids" value=\{caseId\}/);
  assert.doesNotMatch(pageSource, /Move Topics globally<\/button>[\s\S]{0,120}formnovalidate|formnovalidate[^>]*>Move Topics globally/);
});

test('failed quick Topic creation retries only freshly visible submitted Cases and retains assignment intent', () => {
  assert.match(creatorSource, /name="topic_case_ids" value=\{caseId\}/);
  assert.match(serverSource, /selectedCaseIds\(formData, 'topic_case_ids'\)/);
  assert.match(serverSource, /topicCreationFailure\(error, input, caseIds\)/);
  assert.match(pageSource, /failedTopicSelection\(form\)/);
  assert.match(pageSource, /candidate\.topicSelectedCaseIds/);
  assert.match(pageSource, /reconcileVisibleCaseSelection/);
  assert.match(pageSource, /retryRequiresSelection=\{topicCreationRetryRequiresSelection\}/);
});

test('normal Case Library navigation drops selections and shift anchors that are no longer visible', () => {
  assert.match(pageSource, /const visibleIds = data\.cases\.map\(\(item\) => item\.id\);\s*const reconciled = reconcileVisibleCaseSelection/);
  assert.match(pageSource, /if \(reconciled\.removedCount\) selectedCaseIds = reconciled\.selectedIds;/);
  assert.match(pageSource, /if \(selectionAnchorId && !visibleIds\.includes\(selectionAnchorId\)\) selectionAnchorId = null;/);
});

test('Case Library route reuses the page taxonomy model for Topic parent options and rejects inactive quick creation', () => {
  assert.match(serverSource, /topicParents:\s*pageData\.topicParentOptions/);
  assert.match(serverSource, /createCaseLibraryTopic:/);
  assert.match(serverSource, /Create Topics from the active Case Library/);
  assert.doesNotMatch(serverSource, /createCaseLibrarySystem|system-created|new_system_name/);
});

test('active rows expose one classification editor and inactive rows keep classification read-only', () => {
  assert.match(pageSource, /CaseClassificationEditor/);
  assert.match(pageSource, /\{#if inactiveView\}<span>\{item\.conceptName \?\? 'Unassigned'\}<\/span>\{:else\}<div class="classification-cell">/);
  assert.match(classificationSource, />Edit classification<\/button>/);
  assert.match(classificationSource, /Current Topic/);
  assert.match(classificationSource, /Current System/);
});

test('classification System selection clears incompatible Topic state and exposes explicit global move', () => {
  assert.match(classificationSource, /filterCaseLibraryTopicsBySystem\(topics, nextContext\)/);
  assert.match(classificationSource, /selectedTopicId = ''/);
  assert.match(classificationSource, /Filters Topic choices only; it does not change taxonomy hierarchy/);
  assert.match(classificationSource, /Move Topic to System/);
  assert.match(classificationSource, /move-topic-to-system/);
  assert.match(classificationEndpointSource, /caseId,[\s\S]*topicId:[\s\S]*systemId:/);
});

test('global move confirmations communicate shared Case and descendant subtree impact', () => {
  assert.match(classificationSource, /global hierarchy change:[\s\S]*every Case using this Topic[\s\S]*descendant Topic subtree/);
  assert.match(pageSource, /affects every Case using those shared Topics[\s\S]*descendant Topic subtrees/);
});

test('bulk move success metadata includes the validated System name', () => {
  assert.match(serverSource, /system_name: result\.system\.name/);
  assert.match(pageSource, /data\.statusSystemName/);
});

test('classification writes reuse canonical Primary Topic and PR 104 Topic-authoring authorities', () => {
  assert.match(classificationEndpointSource, /promoteCaseTopic\(db, \{ caseId, conceptId:/);
  assert.match(classificationEndpointSource, /createCaseLibraryTopic\(db, \{/);
  assert.match(classificationEndpointSource, /caseIds: \[caseId\]/);
  const start = adminContentSource.indexOf('export async function promoteCaseTopic');
  const end = adminContentSource.indexOf('export async function bulkPromoteCaseTopics');
  const promoteSource = adminContentSource.slice(start, end);
  assert.match(promoteSource, /requireActiveCaseWithOnePrimary/);
  assert.match(promoteSource, /requireActiveTopic/);
});

test('active and inactive bulk action surfaces remain mutually-exclusive sticky toolbars', () => {
  assert.equal((pageSource.match(/class="bulk-toolbar"/g) ?? []).length, 2);
  assert.match(pageSource, /\{#if inactiveView\}[\s\S]*class="bulk-toolbar"[\s\S]*\{:else\}[\s\S]*class="bulk-toolbar"/);
  assert.match(pageSource, /\.bulk-toolbar \{[^}]*position: sticky;[^}]*top: 0\.75rem;[^}]*z-index: 12;/);
  assert.match(pageSource, /@media \(max-width: 600px\)[\s\S]*\.bulk-topic, \.bulk-system \{ min-width: 100%; \}/);
  assert.match(pageSource, />Restore selected<\/button>/);
  assert.match(pageSource, /disabled=\{!selectedCaseIds\.length\}/);
});