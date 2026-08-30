import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localAuthSmoke = readFileSync(new URL('../scripts/local-auth-smoke.mjs', import.meta.url), 'utf8');
const localPreview = readFileSync(new URL('../scripts/local-preview.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('local auth smoke uses the repository-installed Wrangler authority', () => {
  const wranglerVersion = packageJson.devDependencies?.wrangler ?? packageJson.dependencies?.wrangler;
  assert.match(wranglerVersion, /^\d+\.\d+\.\d+$/);
  assert.match(localAuthSmoke, /join\(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler\.js'\)/);
  assert.match(localAuthSmoke, /execFileSync\(process\.execPath, \[wranglerCli, \.\.\.args\]/);
  assert.match(localAuthSmoke, /spawn\(\s*process\.execPath,\s*\[\s*wranglerCli,/);
  assert.match(localAuthSmoke, /runWrangler\(\['--version'\]\)/);
  assert.doesNotMatch(localAuthSmoke, /\bnpx\b[\s\S]*wrangler@\d+\.\d+\.\d+/);
  assert.doesNotMatch(localAuthSmoke, /wrangler@\d+\.\d+\.\d+/);
});

test('local preview delegates Wrangler execution to the tested local runtime plan', () => {
  assert.match(localPreview, /const plan = createLocalPreviewPlan\(\);/);
  assert.match(localPreview, /runStep\(plan\.build, plan\.env\)/);
  assert.match(localPreview, /runStep\(plan\.migrate, plan\.env\)/);
  assert.match(localPreview, /runForeground\(plan\.serve\.command, plan\.serve\.args,/);
  assert.doesNotMatch(localPreview, /\bwranglerCli\b|\bnpx\b|['"]wrangler(?:@\d+\.\d+\.\d+)?['"]/);
});
