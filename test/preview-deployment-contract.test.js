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
const adminDashboardReadModel = readFileSync(new URL('../src/lib/server/db/admin-dashboard.js', import.meta.url), 'utf8');
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
  const r2Names = bindingValue(wrangler, 'MEDIA', 'bucket_name');
  assert.deepEqual(d1Ids, ['ea6f3ec4-eb09-4fb1-8314-cd027436a2f8', 'ea6f3ec4-eb09-4fb1-8314-cd027436a2f8']);
  assert.deepEqual(r2Names, ['flash-cards-media', 'flash-cards-media']);
});

test('manual Preview deployment resolves exact same-repository SHA and never runs a remote migration or production deploy', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pr_number:/);
  assert.match(workflow, /head_repo.*GITHUB_REPOSITORY/);
  assert.match(workflow, /base_ref.*main/);
  assert.match(workflow, /steps\.pr\.outputs\.head_sha/);
  assert.match(workflow, /ref:\s*\$\{\{ steps\.pr\.outputs\.head_sha \}\}/);
  assert.match(workflow, /\.\/node_modules\/\.bin\/wrangler deploy --env preview/);
  assert.doesNotMatch(workflow, /d1 migrations apply[^\n]*--remote/);
  assert.doesNotMatch(workflow, /db:migrate:remote/);
  assert.doesNotMatch(workflow, /npx --yes wrangler@/);
  assert.match(workflow, /drizzle\//);
  assert.match(workflow, /src\/lib\/server\/db\/schema/);
  assert.match(workflow, /This PR changes the D1 schema/);
  assert.match(workflow, /npm run db:check/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run check/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /node scripts\/local-auth-smoke\.mjs/);
  assert.match(workflow, /git diff --check/);
});

test('Preview deployment refuses Worker-config-changing PRs and installs from the lockfile', () => {
  assert.match(workflow, /grep -qx 'wrangler\.jsonc'/);
  assert.match(workflow, /This PR changes wrangler\.jsonc/);
  assert.match(workflow, /review and merge configuration separately/);
  assert.match(workflow, /run:\s*npm ci\s*$/m);
  assert.doesNotMatch(workflow, /run:\s*npm install\s*$/m);
});

test('Cloudflare credentials are scoped only to the final Preview deploy step', () => {
  const firstSecret = workflow.indexOf('secrets.CLOUDFLARE_API_TOKEN');
  const deploy = workflow.indexOf('./node_modules/.bin/wrangler deploy --env preview');
  const validation = workflow.indexOf('npm run db:check');
  assert.ok(firstSecret > validation);
  assert.ok(deploy > firstSecret);
  assert.doesNotMatch(workflow, /CLOUDFLARE_D1_WRITE_TOKEN/);
});

test('Preview Admin bootstrap creates only the dedicated preview_admin role', () => {
  const sql = buildPreviewBootstrapSql({
    userId: 'preview-user',
    accountId: 'preview-account',
    name: 'Preview Admin',
    email: 'preview@example.test',
    passwordHash: 'hash',
    now: 123
  });
  assert.match(sql, /'preview_admin'/);
  assert.doesNotMatch(sql, /'admin'/);
  assert.match(sql, /preview@example\.test/);
  assert.doesNotMatch(sql, /password123|secret/i);
});

test('Preview Worker rejects production Admin and learner Study before route actions can run', () => {
  assert.match(hooks, /isPreviewWorker\(env\)[\s\S]*isRouteWithin\(pathname, '\/admin'\)/);
  assert.match(hooks, /isPreviewWorker\(env\)[\s\S]*isRouteWithin\(pathname, '\/study'\)/);
  assert.match(hooks, /status:\s*403/);
  assert.match(adminLayout, /isPreviewWorker\(platform\?\.env\)[\s\S]*error\(403/);
  assert.match(studyLayout, /isPreviewWorker\(platform\?\.env\)[\s\S]*error\(403/);
});

test('Preview Worker blocks Better Auth Admin API before Better Auth can mutate production users', () => {
  const adminApiGuard = hooks.indexOf("isRouteWithin(pathname, '/api/auth/admin')");
  const createAuthCall = hooks.indexOf('const auth = createAuth(env)');
  const betterAuthHandler = hooks.indexOf('return svelteKitHandler({');

  assert.ok(adminApiGuard >= 0, 'Preview Worker must block the Better Auth Admin plugin route subtree.');
  assert.ok(createAuthCall > adminApiGuard, 'The Better Auth Admin API must be rejected before auth is constructed/queried.');
  assert.ok(betterAuthHandler > adminApiGuard, 'The Better Auth Admin API must be rejected before Better Auth handles the request.');
  assert.match(hooks, /isPreviewWorker\(env\)\s*&&\s*isRouteWithin\(pathname, '\/api\/auth\/admin'\)[\s\S]*return forbidden/);
  assert.match(hooks, /Better Auth user administration is unavailable on the Preview Worker/);

  assert.doesNotMatch(hooks, /isRouteWithin\(pathname, '\/api\/auth'\)/);
  assert.doesNotMatch(hooks, /isRouteWithin\(pathname, '\/api\/auth\/sign-in'\)/);
  assert.doesNotMatch(hooks, /isRouteWithin\(pathname, '\/api\/auth\/sign-out'\)/);
  assert.doesNotMatch(hooks, /isRouteWithin\(pathname, '\/api\/auth\/get-session'\)/);
});

test('Preview-only Admin cannot enter Study, while combined production Admin/Preview Admin can use production Study', () => {
  assert.match(hooks, /isPreviewOnlyAdmin\(event\.locals\.user\)[\s\S]*isRouteWithin\(pathname, '\/study'\)/);
  assert.match(studyLayout, /isPreviewOnlyAdmin\(locals\.user\)[\s\S]*error\(403/);
  assert.match(studyRoute, /isPreviewOnlyAdmin\(user\)/);
  assert.match(reviewRoute, /isPreviewOnlyAdmin\(user\)/);
  assert.match(reviewRoute, /isPreviewWorker\(platform\?\.env\) \|\| isPreviewOnlyAdmin\(user\)/);
  assert.match(studyRoute, /assertLearnerStudyAccess\(locals\.user, platform\)/);
  assert.match(studyRoute, /startReview\(/);
  assert.match(reviewRoute, /function assertLearnerStudyAccess/);
  assert.equal((reviewRoute.match(/assertLearnerStudyAccess\(locals\.user, platform\)/g) ?? []).length, 4);
  assert.match(reviewRoute, /revealReview\(/);
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

test('normal Admin libraries and dashboard read model apply explicit production-ownership filters', () => {
  assert.match(questionsRoute, /isNull\(questionPrompts\.previewSessionId\)/);
  // Image Management V2 centralizes production Asset ownership in the paginated
  // DB helper shared by production and read-only Preview Image Library routes.
  assert.match(imageLibrary, /isNull\(assets\.previewSessionId\)/);
  assert.match(imageLibrary, /isNull\(cases\.previewSessionId\)/);
  // The dashboard now centralizes its production-ownership filters in its read model.
  assert.match(adminDashboardReadModel, /isNull\(assets\.previewSessionId\)/);
  assert.match(adminDashboardReadModel, /isNull\(cases\.previewSessionId\)/);
  assert.match(adminDashboardReadModel, /isNull\(questionPrompts\.previewSessionId\)/);
  assert.doesNotMatch(adminDashboardReadModel, /questionCount:\s*\(await db\.select\(\)\.from\(caseQuestions\)\)\.length/);
});

test('Topic and Tag Admin aggregates/details exclude Preview-owned Cases and Prompts', () => {
  assert.match(topicLibrary, /isNull\(cases\.previewSessionId\)/);
  assert.match(topicLibrary, /isNull\(questionPrompts\.previewSessionId\)/);
  assert.match(tagLibrary, /isNull\(cases\.previewSessionId\)/);
  assert.match(tagLibrary, /isNull\(questionPrompts\.previewSessionId\)/);
  assert.match(tagLibrary, /requireProductionCase/);
  assert.match(tagLibrary, /requireProductionCaseQuestion/);
});
