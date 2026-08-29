import assert from 'node:assert/strict';
import test from 'node:test';

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
  validateStimulusOptionRestoration
};

test('stimulus-groups keeps its current compatibility operations available during decomposition', () => {
  for (const [name, operation] of Object.entries(compatibilityOperations)) {
    assert.equal(typeof operation, 'function', `${name} must remain available from stimulus-groups.js`);
  }
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
