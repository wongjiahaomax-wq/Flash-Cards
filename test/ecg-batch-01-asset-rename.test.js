import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertPostconditions,
  assertPreconditions,
  mutationSql,
  mutationStatements,
  packageId,
  parseMode,
  renameTargets
} from '../scripts/rename-ecg-batch-01-assets.mjs';

function oldRows() {
  return renameTargets.map((target) => ({
    id: target.id,
    type: 'image',
    storage_key: target.storageKey,
    original_filename: target.oldName
  }));
}

function newRows() {
  return renameTargets.map((target) => ({
    id: target.id,
    type: 'image',
    storage_key: target.storageKey,
    original_filename: target.newName
  }));
}

test('Batch 01 targets use deterministic package Asset IDs and Case-aligned ECG filenames', () => {
  assert.equal(renameTargets.length, 13);
  assert.equal(packageId, 'ecg-anki-batch-01-20260816');
  for (const target of renameTargets) {
    assert.match(target.id, /^fc-import:ecg-anki-batch-01-20260816:asset:asset-\d+$/);
    assert.match(target.storageKey, /^teaching-images\/import\/ecg-anki-batch-01-20260816\/asset-\d+\.jpg$/);
    assert.match(target.newName, / — ECG 01\.jpg$/);
    assert.doesNotMatch(target.newName, /^paste-/);
  }
});

test('preconditions accept the known old state and an idempotent already-renamed state', () => {
  assert.doesNotThrow(() => assertPreconditions(oldRows()));
  assert.doesNotThrow(() => assertPreconditions(newRows()));
  const mixed = oldRows();
  mixed[0].original_filename = renameTargets[0].newName;
  assert.doesNotThrow(() => assertPreconditions(mixed));
});

test('preconditions reject missing rows, storage drift, type drift, and unexpected names', () => {
  assert.throws(() => assertPreconditions(oldRows().slice(1)), /precondition failed/i);

  const wrongStorage = oldRows();
  wrongStorage[0].storage_key = 'teaching-images/unexpected.jpg';
  assert.throws(() => assertPreconditions(wrongStorage), /storage key/i);

  const wrongType = oldRows();
  wrongType[0].type = 'pdf';
  assert.throws(() => assertPreconditions(wrongType), /not an image/i);

  const wrongName = oldRows();
  wrongName[0].original_filename = 'someone-edited-this.jpg';
  assert.throws(() => assertPreconditions(wrongName), /unexpected original_filename/i);
});

test('postconditions require every target name and preserve expected storage identity', () => {
  assert.doesNotThrow(() => assertPostconditions(newRows()));

  const old = newRows();
  old[0].original_filename = renameTargets[0].oldName;
  assert.throws(() => assertPostconditions(old), /was not renamed/i);

  const storageDrift = newRows();
  storageDrift[0].storage_key = 'teaching-images/unexpected.jpg';
  assert.throws(() => assertPostconditions(storageDrift), /storage key changed/i);
});

test('mutation uses 13 small individually guarded metadata updates', () => {
  assert.equal(mutationStatements.length, renameTargets.length);
  assert.equal((mutationSql.match(/UPDATE assets/g) ?? []).length, 13);
  assert.doesNotMatch(mutationSql, /SELECT COUNT\(\*\)/i);
  assert.doesNotMatch(mutationSql, /CASE\s+id/i);
  assert.doesNotMatch(mutationSql, /SET\s+storage_key/i);
  assert.doesNotMatch(mutationSql, /DELETE\s+FROM/i);
  assert.doesNotMatch(mutationSql, /INSERT\s+INTO/i);

  for (const [index, statement] of mutationStatements.entries()) {
    const target = renameTargets[index];
    assert.equal((statement.match(/UPDATE assets/g) ?? []).length, 1);
    assert.match(statement, /SET original_filename = /);
    assert.ok(statement.includes(target.id));
    assert.ok(statement.includes(target.storageKey));
    assert.ok(statement.includes(target.oldName));
    assert.ok(statement.includes(target.newName));
    assert.match(statement, /type = 'image'/);
    assert.match(statement, /original_filename IN \(/);
  }
});

test('operator accepts only explicit dry-run or apply mode', () => {
  assert.deepEqual(parseMode(['--dry-run']), { apply: false, dryRun: true });
  assert.deepEqual(parseMode(['--apply']), { apply: true, dryRun: false });
  assert.throws(() => parseMode([]), /Usage:/);
  assert.throws(() => parseMode(['--apply', '--dry-run']), /Usage:/);
  assert.throws(() => parseMode(['--apply', '--other']), /Usage:/);
});
