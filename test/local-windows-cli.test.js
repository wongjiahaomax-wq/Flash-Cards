import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

for (const path of [
  new URL('../scripts/refresh-local-replica.mjs', import.meta.url),
  new URL('../scripts/bootstrap-local-admin.mjs', import.meta.url)
]) {
  test(`${path.pathname.split('/').pop()} avoids Windows .cmd child-process wrappers`, () => {
    const source = readFileSync(path, 'utf8');
    assert.doesNotMatch(source, /\bnpx\.cmd\b|\bnpm\.cmd\b/);
    assert.match(source, /process\.execPath/);
    assert.match(source, /node_modules['"],\s*['"]wrangler['"],\s*['"]bin['"],\s*['"]wrangler\.js['"]/);
  });
}
