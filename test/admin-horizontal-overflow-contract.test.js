import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const appCss = readFileSync(new URL('../src/app.css', import.meta.url), 'utf8');

test('the application viewport does not horizontally scroll from child layout overflow', () => {
  const bodyRule = appCss.match(/^\s*body\s*\{([^}]*)\}/m);
  assert.ok(bodyRule, 'Expected src/app.css to define a body rule.');
  assert.match(bodyRule[1], /overflow-x:\s*hidden\s*;/);
});
