import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const caseServer = readFileSync(new URL('../src/routes/admin/cases/[caseId]/+page.server.js', import.meta.url), 'utf8');
const saveAllMatch = caseServer.match(/saveAll: async \(\{ request, locals, platform, params \}\) => \{[\s\S]*?\n    return \{ ok: true \};\n  \},/);
const saveAll = saveAllMatch?.[0] ?? '';

test('Save All returns client validation failures from stimulus and Case-asset writers as 400', () => {
  assert.ok(saveAll, 'Save All action body should be present');

  assert.match(caseServer, /import \{[^\n]*CaseAssetInputError[^\n]*\} from '\$lib\/server\/db\/case-assets\.js';/);
  assert.match(saveAll, /updateCaseAssetCaption\(/, 'Case caption writer participates in Save All');
  assert.match(saveAll, /updateStimulusGroup\(/, 'stimulus-group writer participates in Save All');
  assert.match(saveAll, /saveStimulusOptionQuestion\(/, 'stimulus option-question writer participates in Save All');
  assert.match(saveAll, /saveStimulusGroupQuestion\(/, 'stimulus group-question writer participates in Save All');

  assert.match(saveAll, /errorValue instanceof StimulusGroupInputError/);
  assert.match(saveAll, /errorValue instanceof CaseAssetInputError/);
  assert.match(saveAll, /return fail\(clientError \? 400 : 500,/);
  assert.match(saveAll, /if \(!clientError\) console\.error\('Case Save All failed\.'/);
});
