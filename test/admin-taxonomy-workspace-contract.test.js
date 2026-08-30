import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const organizer = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyOrganizer.svelte', import.meta.url), 'utf8');
const taxonomyInspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyWorkspaceInspector.svelte', import.meta.url), 'utf8');
const caseInspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/CaseClassificationInspector.svelte', import.meta.url), 'utf8');
const review = readFileSync(new URL('../src/lib/components/taxonomy-workspace/StagedTaxonomyReview.svelte', import.meta.url), 'utf8');
const picker = readFileSync(new URL('../src/lib/components/taxonomy-workspace/SearchableTaxonomyPicker.svelte', import.meta.url), 'utf8');
const topicsAction = readFileSync(new URL('../src/routes/admin/topics/+page.server.js', import.meta.url), 'utf8');

test('taxonomy browse mode reveals Cases on demand and keeps classification read-only', () => {
  assert.match(organizer, /let revealedTopicIds = \$state<string\[\]>\(\[\]\)/);
  assert.match(organizer, /Show Cases/);
  assert.match(organizer, /class="case-title">\{caseItem\.title\}/);
  assert.match(organizer, /href=\{'\/admin\/cases\/' \+ caseItem\.id\}/);
  assert.match(organizer, /class="case-row browse-case-row"/);
  assert.match(organizer, /onclick=\{\(\) => selectOnlyCase\(caseItem\.id\)\}/);
  assert.match(organizer, /editable=\{organizeMode\}/);
  assert.match(organizer, />Open Case<\/a>/);
  assert.match(caseInspector, /editable = false/);
  assert.match(caseInspector, /Browse mode is read-only/);
});

test('taxonomy identity, creation and hierarchy controls stay on the visual organizer', () => {
  assert.match(taxonomyInspector, /Edit identity/);
  assert.match(taxonomyInspector, /action="\?\/updateConcept"/);
  assert.match(taxonomyInspector, /Hierarchy is edited separately through staged Move to/);
  assert.match(picker, /bind:value=\{query\}/);
  assert.match(picker, /filtered/);
  assert.match(organizer, /SearchableTaxonomyPicker/);
  assert.match(organizer, /Search parent or breadcrumb/);
  assert.match(organizer, /Move to…/);
  assert.match(organizer, /Drop Topic here → Unassigned/);
});

test('organize mode keeps Case Primary Topic drag-and-drop plus non-drag Case Tag staging', () => {
  assert.match(organizer, /class="case-drag"/);
  assert.match(organizer, /beginCaseDrag/);
  assert.match(organizer, /stageCasePrimaryTopic\(draggedCaseIds, row\.id\)/);
  assert.match(organizer, /\{#if selectedCases\.length\}[\s\S]*<CaseClassificationInspector/);
  assert.match(organizer, /<CaseClassificationInspector \{selectedCases\}[\s\S]*stagedTagChanges=\{stagedCaseTagChanges\}[\s\S]*onStageTags=\{stageCaseTags\}/);
  assert.match(organizer, /const selectedCaseRows = workspaceCases\.filter\(\(caseItem\) => caseIds\.includes\(caseItem\.id\)\)/);
  assert.match(organizer, /stagedCaseTagChanges = stageCaseTagChanges\(caseTagAssignments, stagedCaseTagChanges, selectedCaseRows, tag, operation\)/);
  assert.match(caseInspector, /Search Topic or breadcrumb/);
  assert.match(caseInspector, /Stage Primary Topic change/);
  assert.match(caseInspector, /Case Tags/);
  assert.match(caseInspector, /Search existing Tags/);
  assert.match(caseInspector, /Stage add/);
  assert.match(caseInspector, /Stage remove/);
  assert.doesNotMatch(organizer, /beginTagDrag|draggedTag|application\/x-flashcards-tag/i);
  assert.doesNotMatch(caseInspector, /draggable=/i);
});

test('staged hierarchy, Primary Topic and Case Tag changes share one review and canonical apply path', () => {
  assert.match(organizer, /\{#if stagedChangeCount\}[\s\S]*<StagedTaxonomyReview/);
  assert.match(review, /Topic hierarchy/);
  assert.match(review, /Case Primary Topic/);
  assert.match(review, /Case Tags/);
  assert.match(review, /expectedParentId: move\.originalParentId/);
  assert.match(review, /expectedConceptId: change\.originalTopicId/);
  assert.match(review, /expectedAttached: change\.expectedAttached/);
  assert.match(review, /action="\?\/applyWorkspace"/);
  assert.match(review, /name="hierarchy_changes_json"/);
  assert.match(review, /name="case_changes_json"/);
  assert.match(review, /name="tag_changes_json"/);
  assert.match(review, /Validate &amp; apply all changes/);
  assert.match(topicsAction, /applyWorkspace:/);
  assert.match(topicsAction, /applyStagedTaxonomyWorkspace/);
});
