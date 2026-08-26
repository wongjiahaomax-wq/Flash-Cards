import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workspace = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyWorkspace.svelte', import.meta.url), 'utf8');
const inspector = readFileSync(new URL('../src/lib/components/taxonomy-workspace/CaseTaxonomyInspector.svelte', import.meta.url), 'utf8');
const tray = readFileSync(new URL('../src/lib/components/taxonomy-workspace/TaxonomyChangeTray.svelte', import.meta.url), 'utf8');
const server = readFileSync(new URL('../src/routes/admin/topics/+page.server.js', import.meta.url), 'utf8');
const staging = readFileSync(new URL('../src/lib/server/db/case-tag-staging.ts', import.meta.url), 'utf8');

test('taxonomy workspace exposes staged single and bulk Case Tag editing without making Tags tree nodes', () => {
  assert.match(inspector, /Search existing Tags/);
  assert.match(inspector, /Stage add/);
  assert.match(inspector, /Stage remove/);
  assert.match(inspector, /up to 60 selected Cases/);
  assert.match(workspace, /stageCaseTagChanges/);
  assert.match(workspace, /stagedCaseTagChanges/);
  assert.match(workspace, /Case Tag change staged/);
  assert.doesNotMatch(workspace, /draggable=.*tag/i);
});

test('Case Tag review submits expected loaded membership through a dedicated staged apply action', () => {
  assert.match(tray, /Case Tags/);
  assert.match(tray, /expectedAttached/);
  assert.match(tray, /action="\?\/applyCaseTags"/);
  assert.match(tray, /Validate &amp; apply Case Tags/);
  assert.match(server, /applyStagedCaseTags/);
  assert.match(server, /tag_changes_json/);
});

test('Case Tag staging keeps stale validation ahead of canonical Tag mutations and leaves System Tag exposure separate', () => {
  const staleCheck = staging.indexOf('currentMembership');
  const canonicalAdd = staging.indexOf('await addCaseTag');
  const canonicalRemove = staging.indexOf('await removeCaseTag');
  assert.ok(staleCheck >= 0 && canonicalAdd > staleCheck && canonicalRemove > staleCheck);
  assert.doesNotMatch(staging, /systemTags|system_tags/);
  assert.match(staging, /not one serializable transaction/);
});
