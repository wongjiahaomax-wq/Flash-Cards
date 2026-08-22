import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const localAuthSmoke = readFileSync(new URL('../scripts/local-auth-smoke.mjs', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

test('local auth smoke uses the repository-installed Wrangler authority', () => {
  assert.equal(packageJson.devDependencies?.wrangler ?? packageJson.dependencies?.wrangler, '4.125.0');
  assert.match(localAuthSmoke, /join\(repoRoot, 'node_modules', 'wrangler', 'bin', 'wrangler\.js'\)/);
  assert.match(localAuthSmoke, /execFileSync\(process\.execPath, \[wranglerCli, \.\.\.args\]/);
  assert.match(localAuthSmoke, /spawn\(\s*process\.execPath,\s*\[\s*wranglerCli,/);
  assert.match(localAuthSmoke, /runWrangler\(\['--version'\]\)/);
  assert.doesNotMatch(localAuthSmoke, /\bnpx\b[\s\S]*wrangler@\d+\.\d+\.\d+/);
  assert.doesNotMatch(localAuthSmoke, /wrangler@\d+\.\d+\.\d+/);
});
