import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

/** @param {string} path */
function source(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('Tranche 5 exposes only self-scoped Administrator study-data deletion', () => {
  const server = source('src/routes/admin/my-study-data/+page.server.js');
  const page = source('src/routes/admin/my-study-data/+page.svelte');
  const layout = source('src/routes/admin/+layout.svelte');

  assert.match(server, /isPreviewWorker/);
  assert.match(server, /isProductionAdmin/);
  assert.match(server, /advanceStudyDataDeletion/);
  assert.match(server, /beginStudyDataDeletion/);
  assert.match(server, /getStudyDataDeletionStatus/);
  assert.match(server, /continueStudyDataDeletion:/);
  assert.match(server, /deleteStudyData:/);
  assert.match(server, /locals\.user/);
  assert.match(server, /user\.id/);
  assert.doesNotMatch(server, /formData\.get\(['"]userId['"]\)/);
  assert.doesNotMatch(server, /learner-analytics|removeUserWithBetterAuth|deleteLearner/);
  assert.match(server, /DELETE MY STUDY DATA/);
  assert.match(server, /MAX_DELETION_STEPS_PER_REQUEST = 4/);
  assert.match(server, /administrator account and role remain active/);

  assert.match(page, /Clear my study data/);
  assert.match(page, /Your administrator account, role,\s*login, preferences/);
  assert.match(page, /name="confirmation"/);
  assert.match(page, /Continue deletion/);
  assert.match(page, /data\.deletion\?\.inProgress/);
  assert.doesNotMatch(page, /name="userId"|learner-analytics|selected learner/i);
  assert.match(layout, /href="\/admin\/my-study-data">My study data/);
});

test('Administrator self-service route keeps the Preview Worker boundary explicit', () => {
  const server = source('src/routes/admin/my-study-data/+page.server.js');
  const layout = source('src/routes/admin/+layout.server.js');

  assert.match(server, /isPreviewWorker\(platform\?\.env\)[\s\S]*error\(403/);
  assert.match(server, /isProductionAdmin\(locals\.user\)[\s\S]*error\(403/);
  assert.match(layout, /isPreviewWorker\(platform\?\.env\)[\s\S]*error\(403/);
});
