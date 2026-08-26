import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const organizer = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyOrganizer.svelte', import.meta.url), 'utf8');
const taxonomyInspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyWorkspaceInspector.svelte', import.meta.url), 'utf8');
const caseInspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/CaseClassificationInspector.svelte', import.meta.url), 'utf8');
const review = readFileSync(new URL('../src/lib/components/taxonomy-workspace/StagedTaxonomyReview.svelte', import.meta.url), 'utf8');
const picker = readFileSync(new URL('../src/lib/components/taxonomy-workspace/SearchableTaxonomyPicker.svelte', import.meta.url), 'utf8');
const readModel = readFileSync(new URL('../src/lib/server/db/taxonomy-admin-read.ts', import.meta.url), 'utf8');
const workspaceStaging = readFileSync(new URL('../src/lib/server/db/taxonomy-workspace-staging.ts', import.meta.url), 'utf8');
const topicsAction = readFileSync(new URL('../src/routes/admin/topics/+page.server.js', import.meta.url), 'utf8');

test('Cases stay hidden by default and revealed rows lead with human-readable Case titles', () => {
  assert.match(organizer, /let revealedTopicIds = \$state<string\[\]>\(\[\]\)/);
  assert.match(organizer, /Show Cases/);
  assert.match(organizer, /class="case-title">\{caseItem\.title\}/);
  assert.match(organizer, /href=\{'\/admin\/cases\/' \+ caseItem\.id\}/);
  assert.match(readModel, /directCasesByTopic/);
  assert.match(readModel, /eq\(caseConcepts\.role, 'primary'\)/);
  assert.match(readModel, /isNull\(cases\.previewSessionId\)/);
});

test('Topic inspector supports focused identity editing while hierarchy remains staged separately', () => {
  assert.match(taxonomyInspector, /Edit identity/);
  assert.match(taxonomyInspector, /action="\?\/updateConcept"/);
  assert.match(taxonomyInspector, /name="name"/);
  assert.match(taxonomyInspector, /name="description_md"/);
  assert.match(taxonomyInspector, /name="is_active"/);
  assert.match(taxonomyInspector, /Hierarchy is edited separately through staged Move to/);
  assert.match(topicsAction, /updateTaxonomyConcept/);
  assert.match(topicsAction, /updateConcept:/);
});

test('hierarchy creation and move fallbacks use a searchable taxonomy picker', () => {
  assert.match(picker, /bind:value=\{query\}/);
  assert.match(picker, /filtered/);
  assert.match(organizer, /SearchableTaxonomyPicker/);
  assert.match(organizer, /Search parent or breadcrumb/);
  assert.match(organizer, /Search System or Topic/);
  assert.match(organizer, /Move to…/);
  assert.match(organizer, /Drop Topic here → Unassigned/);
});

test('Organize mode stages Case to Topic drag-and-drop and keeps a searchable non-drag fallback', () => {
  assert.match(organizer, /class="case-drag"/);
  assert.match(organizer, /beginCaseDrag/);
  assert.match(organizer, /if \(draggedCaseIds\.length\) return row\.kind === 'topic'/);
  assert.match(organizer, /stageCasePrimaryTopic\(draggedCaseIds, row\.id\)/);
  assert.match(caseInspector, /Search Topic or breadcrumb/);
  assert.match(caseInspector, /Changing Primary Topic changes canonical Case classification/);
  assert.match(caseInspector, /Stage Primary Topic change/);
});

test('Case inspector supports single and bulk Primary Topic plus Case Tag staging', () => {
  assert.match(organizer, /Select direct Cases/);
  assert.match(organizer, /<CaseClassificationInspector/);
  assert.match(caseInspector, /Loaded Primary Topic/);
  assert.match(caseInspector, /Projected Primary Topic/);
  assert.match(caseInspector, /Case Tags/);
  assert.match(caseInspector, /Search existing Tags/);
  assert.match(caseInspector, /Stage add/);
  assert.match(caseInspector, /Stage remove/);
  assert.match(caseInspector, /up to 60 selected Cases/);
  assert.doesNotMatch(organizer, /beginTagDrag|draggedTag|application\/x-flashcards-tag/i);
  assert.doesNotMatch(caseInspector, /draggable=/i);
});

test('mixed hierarchy, Primary Topic and Case Tag changes share one staged review/apply workflow', () => {
  assert.match(review, /Topic hierarchy/);
  assert.match(review, /Case Primary Topic/);
  assert.match(review, /Case Tags/);
  assert.match(review, /expectedParentId: move\.originalParentId/);
  assert.match(review, /expectedConceptId: change\.originalTopicId/);
  assert.match(review, /expectedAttached: change\.expectedAttached/);
  assert.match(review, /action="\?\/applyWorkspace"/);
  assert.match(review, /Validate &amp; apply all changes/);
  assert.match(topicsAction, /applyStagedTaxonomyWorkspace/);
  assert.match(topicsAction, /applyWorkspace:/);
  assert.doesNotMatch(organizer, /Apply or discard the staged hierarchy batch before staging Case/);
});

test('unified workspace helper completes every stale-state preflight before the first canonical write', () => {
  const hierarchyValidate = workspaceStaging.indexOf('await validateStagedTaxonomyHierarchy');
  const primaryValidate = workspaceStaging.indexOf('await validateStagedCasePrimaryTopics');
  const tagValidate = workspaceStaging.indexOf('await validateStagedCaseTags');
  const firstApply = workspaceStaging.indexOf('await applyValidatedTaxonomyHierarchy');
  assert.ok(hierarchyValidate >= 0);
  assert.ok(primaryValidate > hierarchyValidate);
  assert.ok(tagValidate > primaryValidate);
  assert.ok(firstApply > tagValidate);
  assert.match(workspaceStaging, /does not provide one serializable transaction/);
});