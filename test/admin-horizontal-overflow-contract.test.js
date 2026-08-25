import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appCss = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');

test('the application viewport does not horizontally scroll from child layout overflow', () => {
  assert.match(appCss, /body\s*\{[\s\S]*overflow-x:\s*hidden;/);
});
