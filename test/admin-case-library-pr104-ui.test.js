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
  assert.match(pageSource, /action=\{actionHref\(inactiveView \? 'bulkRestoreCases' : 'bulkPromoteTopic'\)\}/);
  assert.match(pageSource, /formaction=\{actionHref\('bulkDeactivateCases'\)\}/);
  assert.match(pageSource, /actionQuery=\{currentQuery\(\)\}/);
  assert.match(creatorSource, /caseLibraryNamedActionHref\('createCaseLibraryTopic', actionQuery\)/);
  assert.match(bulkTagSource, /actionQuery \|\| caseLibraryReturnQuery\(page\.url\.searchParams\)/);
  assert.match(bulkTagSource, /caseLibraryNamedActionHref\('bulkAddCaseTag', effectiveActionQuery\)/);
  assert.match(bulkTagSource, /caseLibraryNamedActionHref\('bulkRemoveCaseTag', effectiveActionQuery\)/);
  assert.match(bulkTagSource, /caseLibraryNamedActionHref\('bulkCreateAndAddCaseTag', effectiveActionQuery\)/);
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
  assert.match(creatorSource, /caseLibraryNamedActionHref\('createCaseLibraryTopic', actionQuery\)/);
  assert.match(creatorSource, /Create & assign to \$\{selectedCount\}/);
});

test('failed quick Topic creation retries only freshly visible submitted Cases and retains assignment intent', () => {
  assert.match(creatorSource, /name="topic_case_ids" value=\{caseId\}/);
  assert.match(serverSource, /selectedCaseIds\(formData, 'topic_case_ids'\)/);
  assert.match(serverSource, /topicCreationFailure\(error, input, caseIds\)/);
  assert.match(serverSource, /topicSelectedCaseIds: caseIds/);
  assert.match(pageSource, /failedTopicSelection\(form\)/);
  assert.match(pageSource, /candidate\.topicSelectedCaseIds/);
  assert.match(pageSource, /const visibleIds = data\.cases\.map\(\(item\) => item\.id\)/);
  assert.match(pageSource, /reconcileVisibleCaseSelection\(\{[\s\S]*visibleIds/);
  assert.match(pageSource, /selectedCaseIds = \$state\(failedSelection\.selectedIds\)/);
  assert.match(pageSource, /removedFailedTopicSelectionCount/);
  assert.match(pageSource, /no longer visible in this Case Library view/);
  assert.match(pageSource, /topicCreationRetryRequiresSelection = \$derived\(topicCreationFailure && failedSelection\.submittedCount > 0\)/);
  assert.match(pageSource, /retryRequiresSelection=\{topicCreationRetryRequiresSelection\}/);
  assert.match(creatorSource, /retryRequiresSelection && !selectedCount/);
  assert.match(creatorSource, /Select a Case to retry/);
});

test('Case Library route reuses the page taxonomy model for Topic parent options and rejects inactive quick creation', () => {
  assert.match(serverSource, /topicParents:\s*pageData\.topicParentOptions/);
  assert.match(serverSource, /createCaseLibraryTopic:/);
  assert.match(serverSource, /Create Topics from the active Case Library/);
  assert.doesNotMatch(serverSource, /listAdminConcepts|listActiveSystems/);
});

test('active rows expose one classification editor and inactive rows keep classification read-only', () => {
  assert.match(pageSource, /CaseClassificationEditor/);
  assert.match(pageSource, /\{#if inactiveView\}<span>\{item\.conceptName \?\? 'Unassigned'\}<\/span>\{:else\}<div class="classification-cell">/);
  assert.match(classificationSource, />Edit classification<\/button>/);
  assert.match(classificationSource, /role="dialog" aria-label=\{`Edit classification for \$\{caseTitle\}`\}/);
  assert.match(classificationSource, /Current Topic/);
  assert.match(classificationSource, /Current System/);
  assert.match(classificationSource, /closeOnEscape/);
});

test('classification System selection is navigation only and incompatible hidden Topic state is cleared', () => {
  assert.match(classificationSource, /filterCaseLibraryTopicsBySystem\(topics, nextContext\)/);
  assert.match(classificationSource, /selectedTopicId = ''/);
  assert.match(classificationSource, /Filters Topic choices only; it does not change taxonomy hierarchy/);
  assert.doesNotMatch(classificationSource, /name="system/);
  assert.doesNotMatch(classificationEndpointSource, /system_id|systemId/);
  assert.match(classificationSource, /caseLibraryTopicLabel\(topic\)/);
});

test('classification writes reuse canonical Primary Topic and PR 104 Topic-authoring authorities', () => {
  assert.match(classificationEndpointSource, /promoteCaseTopic\(db, \{ caseId, conceptId:/);
  assert.match(classificationEndpointSource, /createCaseLibraryTopic\(db, \{/);
  assert.match(classificationEndpointSource, /caseIds: \[caseId\]/);
  assert.match(classificationSource, />\+ New Topic<\/button>/);
  assert.match(classificationSource, /Create & assign/);

  const start = adminContentSource.indexOf('export async function promoteCaseTopic');
  const end = adminContentSource.indexOf('export async function bulkPromoteCaseTopics');
  const promoteSource = adminContentSource.slice(start, end);
  assert.match(promoteSource, /requireActiveCaseWithOnePrimary/);
  assert.match(promoteSource, /requireActiveTopic/);
  assert.match(promoteSource, /set\(\{ conceptId, role: 'primary' \}\)/);
  assert.doesNotMatch(promoteSource, /caseTags|tag-schema|tags\./, 'Primary Topic reassignment must not mutate Case Tags');
});

test('active and inactive bulk action surfaces are one mutually-exclusive sticky toolbar with narrow-screen wrapping', () => {
  assert.equal((pageSource.match(/class="bulk-toolbar"/g) ?? []).length, 2, 'active and inactive branches each define their one runtime toolbar');
  assert.match(pageSource, /\{#if inactiveView\}[\s\S]*class="bulk-toolbar"[\s\S]*\{:else\}[\s\S]*class="bulk-toolbar"/);
  assert.doesNotMatch(pageSource, /bulk-toolbar-clone|floating-bulk-toolbar/);
  assert.match(pageSource, /\.bulk-toolbar \{[^}]*position: sticky;[^}]*top: 0\.75rem;[^}]*z-index: 12;/);
  assert.match(pageSource, /\.bulk-toolbar \{[^}]*background: #fff;[^}]*box-shadow:/);
  assert.match(pageSource, /\.bulk-toolbar \{[^}]*flex-wrap: wrap;/);
  assert.match(pageSource, /@media \(max-width: 600px\)[\s\S]*\.bulk-topic \{ min-width: 100%; \}/);
  assert.match(pageSource, /\.selection-hint \{ display: none; \}/);
  assert.match(pageSource, />Restore selected<\/button>/);
  assert.match(pageSource, /disabled=\{!selectedCaseIds\.length\}/);
});
