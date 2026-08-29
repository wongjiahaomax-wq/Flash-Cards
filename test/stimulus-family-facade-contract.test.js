import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { StimulusGroupInputError as PrimitiveStimulusGroupInputError } from '../src/lib/server/db/stimulus-family-error.js';
import { setStimulusGroupOriginal } from '../src/lib/server/db/stimulus-originals.js';
import { convertStimulusOptionToSupporting } from '../src/lib/server/db/stimulus-role-conversion.js';
import {
  StimulusGroupInputError,
  addStimulusOption,
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  ensurePromptIsNotUsedByAnotherGroup,
  getAdminStimulusData,
  getCaseStimulusCoverageRequirement,
  moveStimulusOption,
  removeStimulusGroupQuestion,
  removeStimulusOptionFromCase,
  removeStimulusOptionQuestion,
  saveStimulusGroupQuestion,
  saveStimulusOptionQuestion,
  setStimulusOptionActive,
  startStimulusGroupFromCaseAsset,
  updateStimulusGroup,
  validateStimulusOptionMoveState,
  validateStimulusOptionRestoration
} from '../src/lib/server/db/stimulus-groups.js';

const compatibilityOperations = {
  addStimulusOption,
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  ensurePromptIsNotUsedByAnotherGroup,
  getAdminStimulusData,
  getCaseStimulusCoverageRequirement,
  moveStimulusOption,
  removeStimulusGroupQuestion,
  removeStimulusOptionFromCase,
  removeStimulusOptionQuestion,
  saveStimulusGroupQuestion,
  saveStimulusOptionQuestion,
  setStimulusOptionActive,
  startStimulusGroupFromCaseAsset,
  updateStimulusGroup,
  validateStimulusOptionMoveState,
  validateStimulusOptionRestoration
};

const downwardModules = [
  'stimulus-family-error.js',
  'stimulus-family-input.js',
  'stimulus-family-eligibility.js',
  'stimulus-family-coverage.js',
  'stimulus-family-specificity.js',
  'stimulus-family-live-state.js',
  'stimulus-family-admin-read.js',
  'stimulus-family-lifecycle.js',
  'stimulus-option-lifecycle.js',
  'stimulus-question-mutations.js',
  'learner-stimulus-families.js',
  'learner-case-source.js'
];

test('stimulus-groups keeps its current compatibility operations available during decomposition', () => {
  for (const [name, operation] of Object.entries(compatibilityOperations)) {
    assert.equal(typeof operation, 'function', `${name} must remain available from stimulus-groups.js`);
  }
});

test('stimulus-groups re-exports the exact canonical StimulusGroupInputError constructor', () => {
  assert.equal(StimulusGroupInputError, PrimitiveStimulusGroupInputError);
});

test('focused Stimulus mutations preserve the shared facade error identity used by Admin routes', async () => {
  await assert.rejects(
    setStimulusGroupOriginal(/** @type {any} */ (null), '', 'group-id', 'option-id'),
    (error) => error instanceof StimulusGroupInputError && /Case is required/.test(error.message)
  );

  await assert.rejects(
    convertStimulusOptionToSupporting(/** @type {any} */ (null), ''),
    (error) => error instanceof StimulusGroupInputError && /Stimulus option is required/.test(error.message)
  );
});

test('extracted Stimulus Family modules do not depend upward on the compatibility facade', async () => {
  for (const filename of downwardModules) {
    const source = await readFile(new URL(`../src/lib/server/db/${filename}`, import.meta.url), 'utf8');
    assert.equal(
      source.includes("./stimulus-groups.js"),
      false,
      `${filename} must depend on extracted primitives/policy rather than stimulus-groups.js`
    );
  }
});

test('learner Stimulus adapters remain read-oriented and independent of Production mutation services', async () => {
  for (const filename of ['learner-stimulus-families.js', 'learner-case-source.js']) {
    const source = await readFile(new URL(`../src/lib/server/db/${filename}`, import.meta.url), 'utf8');
    for (const forbidden of [
      'stimulus-groups.js',
      'stimulus-family-lifecycle.js',
      'stimulus-option-lifecycle.js',
      'stimulus-question-mutations.js'
    ]) {
      assert.equal(source.includes(forbidden), false, `${filename} must not import ${forbidden}`);
    }
  }
});
