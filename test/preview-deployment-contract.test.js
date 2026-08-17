import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildPreviewBootstrapSql } from '../scripts/bootstrap-preview-admin.mjs';

const workflow = readFileSync(new URL('../.github/workflows/deploy-pr-to-preview.yml', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const hooks = readFileSync(new URL('../src/hooks.server.js', import.meta.url), 'utf8');
const adminLayout = readFileSync(new URL('../src/routes/admin/+layout.server.js', import.meta.url), 'utf8');
const studyLayout = readFileSync(new URL('../src/routes/study/+layout.server.js', import.meta.url), 'utf8');
const studyRoute = readFileSync(new URL('../src/routes/study/+page.server.js', import.meta.url), 'utf8');
const reviewRoute = readFileSync(new URL('../src/routes/study/[reviewId]/+page.server.js', import.meta.url), 'utf8');
const previewRoute = readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
const previewSignOut = readFileSync(new URL('../src/lib/components/PreviewSignOutButton.svelte', import.meta.url), 'utf8');
const questionsRoute = readFileSync(new URL('../src/routes/admin/questions/+page.server.js', import.meta.url), 'utf8');
const imageLibrary = readFileSync(new URL('../src/lib/server/db/asset-library.js', import.meta.url), 'utf8');
const legacyAdminRoute = readFileSync(new URL('../src/routes/admin/+page.server.js', import.meta.url), 'utf8');
const topicLibrary = readFileSync(new URL('../src/lib/server/db/topic-library.js', import.meta.url), 'utf8');
const tagLibrary = readFileSync(new URL('../src/lib/server/db/tag-library.js', import.meta.url), 'utf8');

/** @param {string} configText @param {string} binding @param {string} field */
function bindingValue(configText, binding, field) {
  const escaped = binding.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`"binding"\\s*:\\s*"${escaped}"[\\s\\S]*?"${field}"\\s*:\\s*"([^"]+)"`, 'g');
  return [...configText.matchAll(pattern)].map((match) => match[1]);
}

test('Preview Worker configuration reuses the exact existing D1 and R2 resources', () => {
  assert.match(wrangler, /"preview"\s*:\s*\{/);
  assert.match(wrangler, /"name"\s*:\s*"flash-cards-preview"/);
  assert.match(wrangler, /"PREVIEW_MODE"\s*:\s*"true"/);
  assert.match(wrangler, /"BETTER_AUTH_URL"\s*:\s*"https:\/\/flash-cards-preview\.mmed-fm-flashcardstest\.workers\.dev"/);

  const d1Ids = bindingValue(wrangler, 'DB', 'database_id');
  const r2Buckets = bindingValue(wrangler, 'MEDIA', 'bucket_name');
  assert.equal(new Set(d1Ids).size, 1);
  assert.equal(new Set(r2Buckets).size, 1);
});

test('Preview request hook blocks production Admin, Study, and Admin-plugin endpoints', () => {
  assert.match(hooks, /PREVIEW_MODE/);
  assert.match(hooks, /pathname\.startsWith\('\/admin'/);
  assert.match(hooks, /pathname\.startsWith\('\/study'/);
  assert.match(hooks, /pathname\.startsWith\('\/api\/auth\/admin'/);
});

test('production and Preview layouts preserve their role boundaries', () => {
  assert.match(adminLayout, /admin/);
  assert.match(adminLayout, /PREVIEW_MODE/);
  assert.match(studyLayout, /preview_admin/);
  assert.match(studyLayout, /PREVIEW_MODE/);
});

test('learner Study/Review route source keeps explicit Preview ownership exclusions', () => {
  assert.match(studyRoute, /isNull\(cases\.previewSessionId\)/);
  assert.match(reviewRoute, /isNull\(cases\.previewSessionId\)/);
  assert.match(reviewRoute, /completeReview\(/);
  assert.match(reviewRoute, /startReview\(/);
});

test('Preview Case route rejects global authoring and never calls production Admin mutation helpers', () => {
  assert.match(previewRoute, /createConcept:\s*async \(\) => fail\(403/);
  assert.match(previewRoute, /createCase:\s*async \(\) => fail\(403/);
  assert.match(previewRoute, /requirePreviewAdmin/);
  assert.match(previewRoute, /getLivePreviewSession/);
  assert.match(previewRoute, /PreviewWorkspaceError/);
  assert.doesNotMatch(previewRoute, /updateAssetMetadata|updateQuestionPrompt|createAssetFromUpload\(/);
});

test('normal Preview logout resets the workspace before Better Auth sign-out', () => {
  const resetCall = previewSignOut.indexOf("fetch('/preview-admin/reset', { method: 'POST' })");
  const signOutCall = previewSignOut.indexOf('authClient.signOut()');
  assert.ok(resetCall >= 0);
  assert.ok(signOutCall > resetCall);
  assert.match(previewSignOut, /if \(!response\.ok\)[\s\S]*return;/);
});

test('normal Admin libraries and legacy dashboard apply explicit production-ownership filters', () => {
  assert.match(questionsRoute, /isNull\(questionPrompts\.previewSessionId\)/);
  // Image Management V2 moved the canonical paginated Asset query into the
  // shared DB helper used by both production and read-only Preview libraries.
  assert.match(imageLibrary, /isNull\(assets\.previewSessionId\)/);
  assert.match(imageLibrary, /isNull\(cases\.previewSessionId\)/);
  assert.match(legacyAdminRoute, /isNull\(assets\.previewSessionId\)/);
  assert.match(legacyAdminRoute, /isNull\(cases\.previewSessionId\)/);
  assert.match(legacyAdminRoute, /isNull\(questionPrompts\.previewSessionId\)/);
  assert.doesNotMatch(legacyAdminRoute, /questionCount:\s*\(await db\.select\(\)\.from\(caseQuestions\)\)\.length/);
});

test('Topic and Tag Admin aggregates/details exclude Preview-owned Cases and Prompts', () => {
  assert.match(topicLibrary, /isNull\(cases\.previewSessionId\)/);
  assert.match(topicLibrary, /isNull\(questionPrompts\.previewSessionId\)/);
  assert.match(tagLibrary, /isNull\(cases\.previewSessionId\)/);
  assert.match(tagLibrary, /isNull\(questionPrompts\.previewSessionId\)/);
  assert.match(tagLibrary, /requireProductionCase/);
  assert.match(tagLibrary, /requireProductionCaseQuestion/);
});

test('bootstrap SQL preserves an existing Admin role and promotes it to combined ownership', () => {
  const sql = buildPreviewBootstrapSql({ email: 'owner@example.com', production: true });
  assert.match(sql, /admin,preview_admin/);
  assert.match(sql, /role = 'admin'/);
  assert.match(sql, /banned = 0/);
});

test('bootstrap SQL does not change an existing credential or password', () => {
  const sql = buildPreviewBootstrapSql({ email: 'owner@example.com', production: true });
  assert.doesNotMatch(sql, /account|password|credential/i);
});
