import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const organizer = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyOrganizer.svelte', import.meta.url), 'utf8');
const taxonomyInspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyWorkspaceInspector.svelte', import.meta.url), 'utf8');
const caseInspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/CaseClassificationInspector.svelte', import.meta.url), 'utf8');
const picker = readFileSync(new URL('../src/lib/components/taxonomy-workspace/SearchableTaxonomyPicker.svelte', import.meta.url), 'utf8');

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
  assert.match(caseInspector, /Search Topic or breadcrumb/);
  assert.match(caseInspector, /Stage Primary Topic change/);
  assert.match(caseInspector, /Case Tags/);
  assert.match(caseInspector, /Search existing Tags/);
  assert.match(caseInspector, /Stage add/);
  assert.match(caseInspector, /Stage remove/);
  assert.doesNotMatch(organizer, /beginTagDrag|draggedTag|application\/x-flashcards-tag/i);
  assert.doesNotMatch(caseInspector, /draggable=/i);
});