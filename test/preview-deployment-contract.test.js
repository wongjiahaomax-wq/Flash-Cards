import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { buildPreviewBootstrapSql } from '../scripts/bootstrap-preview-admin.mjs';

const workflow = readFileSync(new URL('../.github/workflows/deploy-pr-to-preview.yml', import.meta.url), 'utf8');
const wrangler = readFileSync(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const previewRoute = readFileSync(new URL('../src/routes/preview-admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
const questionsRoute = readFileSync(new URL('../src/routes/admin/questions/+page.server.js', import.meta.url), 'utf8');
const imagesRoute = readFileSync(new URL('../src/routes/admin/images/+page.server.js', import.meta.url), 'utf8');

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

test('manual Preview deployment resolves exact same-repository SHA and never runs a remote migration', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /pr_number:/);
  assert.match(workflow, /head_repo.*GITHUB_REPOSITORY/);
  assert.match(workflow, /steps\.pr\.outputs\.head_sha/);
  assert.match(workflow, /ref:\s*\$\{\{ steps\.pr\.outputs\.head_sha \}\}/);
  assert.match(workflow, /wrangler@4\.123\.0 deploy --env preview/);
  assert.doesNotMatch(workflow, /d1 migrations apply[^\n]*--remote/);
  assert.doesNotMatch(workflow, /db:migrate:remote/);
  assert.doesNotMatch(workflow, /wrangler@4\.123\.0 deploy\s*$/m);
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

test('Cloudflare credentials are scoped only to the final Preview deploy step', () => {
  const firstSecret = workflow.indexOf('secrets.CLOUDFLARE_API_TOKEN');
  const deploy = workflow.indexOf('wrangler@4.123.0 deploy --env preview');
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

test('Preview Case route rejects global authoring and never calls production Admin mutation helpers', () => {
  assert.match(previewRoute, /createConcept:\s*async \(\) => fail\(403/);
  assert.match(previewRoute, /createCase:\s*async \(\) => fail\(403/);
  assert.match(previewRoute, /requirePreviewAdmin/);
  assert.match(previewRoute, /getLivePreviewSession/);
  assert.match(previewRoute, /PreviewWorkspaceError/);
  assert.doesNotMatch(previewRoute, /updateAssetMetadata|updateQuestionPrompt|createAssetFromUpload\(/);
});

test('normal Questions and Images libraries apply explicit production-ownership filters', () => {
  assert.match(questionsRoute, /isNull\(questionPrompts\.previewSessionId\)/);
  assert.match(imagesRoute, /isNull\(assets\.previewSessionId\)/);
});
