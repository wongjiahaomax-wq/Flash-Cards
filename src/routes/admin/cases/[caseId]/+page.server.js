import { fail, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';

import { createDb } from '$lib/server/db/index.js';
import { caseAssets, stimulusGroups } from '$lib/server/db/schema.js';
import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import {
  convertCaseAssetToStimulusOption,
  createStimulusGroup,
  StimulusGroupInputError
} from '$lib/server/db/stimulus-groups.js';
import { load as loadCases, actions as parentActions } from '../../+page.server.js';

export async function load(event) {
  const url = new URL(event.url);
  url.searchParams.set('case', event.params.caseId);
  return loadCases(/** @type {any} */ ({ ...event, url }));
}

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export const actions = {
  ...parentActions,

  startAlternativeSet: async ({ request, locals, platform, params }) => {
    if (!canManageCaseAssets(locals.user)) {
      return fail(403, { error: 'Administrator access is required.' });
    }
    if (!platform?.env?.DB) {
      return fail(503, { error: 'The study database is not configured.' });
    }

    const formData = await request.formData();
    const caseId = formText(formData, 'case_id') || params.caseId;
    const assetId = formText(formData, 'asset_id');
    const name = formText(formData, 'set_name');

    if (caseId !== params.caseId) {
      return fail(400, { error: 'The selected Case does not match this editor.', caseId });
    }

    const db = createDb(platform.env.DB);
    let createdGroupId = null;

    try {
      const fixed = await db
        .select({ assetId: caseAssets.assetId })
        .from(caseAssets)
        .where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId)))
        .limit(1);

      if (!fixed[0]) {
        throw new StimulusGroupInputError('Choose a fixed image from this Case to start an alternative set.');
      }

      createdGroupId = await createStimulusGroup(db, {
        caseId,
        name,
        specificQuestionMode: 'none'
      });
      await convertCaseAssetToStimulusOption(db, createdGroupId, assetId);
    } catch (error) {
      if (createdGroupId) {
        try {
          await db.delete(stimulusGroups).where(eq(stimulusGroups.id, createdGroupId));
        } catch {
          // D1 batches make the conversion atomic in production. Cleanup is best-effort for an unexpected failure.
        }
      }
      return fail(error instanceof StimulusGroupInputError ? 400 : 500, {
        error: error instanceof StimulusGroupInputError ? error.message : 'Unable to start an alternative image set.',
        caseId
      });
    }

    redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=alternative-set-created#stimuli`);
  }
};
