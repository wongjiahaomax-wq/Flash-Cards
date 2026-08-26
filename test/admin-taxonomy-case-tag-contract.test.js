import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const organizer = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyOrganizer.svelte', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/CaseClassificationInspector.svelte', import.meta.url), 'utf8');
const review = readFileSync(new URL('../src/lib/components/taxonomy-workspace/StagedTaxonomyReview.svelte', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/routes/admin/topics/+page.server.js', import.meta.url), 'utf8');
const staging = readFileSync(new URL('../src/lib/server/db/case-tag-staging.ts', import.meta.url), 'utf8');

test('taxonomy organizer exposes staged single and bulk Case Tag editing without making Tags tree nodes', () => {
  assert.match(inspector, /Search existing Tags/);
  assert.match(inspector, /Stage add/);
  assert.match(inspector, /Stage remove/);
  assert.match(inspector, /up to 60 selected Cases/);
  assert.match(organizer, /stageCaseTagChanges/);
  assert.match(organizer, /stagedCaseTagChanges/);
  assert.match(organizer, /Case Tag change staged/);
  assert.doesNotMatch(organizer, /draggable=.*tag/i);
});

test('Case Tag review submits expected loaded membership through the unified staged apply action', () => {
  assert.match(review, /Case Tags/);
  assert.match(review, /expectedAttached/);
  assert.match(review, /action="\?\/applyWorkspace"/);
  assert.match(review, /Validate &amp; apply all changes/);
  assert.match(server, /applyStagedTaxonomyWorkspace/);
  assert.match(server, /tag_changes_json/);
});

test('Case Tag validation keeps stale and active-target checks ahead of canonical mutations and leaves System Tag exposure separate', () => {
  const staleCheck = staging.indexOf('currentMembership');
  const activeTagCheck = staging.indexOf('activeAddTagIds');
  const canonicalAdd = staging.indexOf('await addCaseTag');
  const canonicalRemove = staging.indexOf('await removeCaseTag');
  assert.ok(staleCheck >= 0 && activeTagCheck >= 0);
  assert.ok(canonicalAdd > staleCheck && canonicalRemove > staleCheck);
  assert.doesNotMatch(staging, /systemTags|system_tags/);
  assert.match(staging, /not one serializable/);
});
