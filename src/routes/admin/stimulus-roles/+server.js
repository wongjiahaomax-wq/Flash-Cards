import { redirect } from '@sveltejs/kit';

import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { createDb } from '$lib/server/db/index.js';
import { assignSimpleStimulusRoles, SimpleStimulusCurationInputError } from '$lib/server/db/simple-stimulus-curation.js';
import { convertCaseAssetToStimulusOption, StimulusGroupInputError } from '$lib/server/db/stimulus-groups.js';
import { setStimulusGroupOriginal } from '$lib/server/db/stimulus-originals.js';

/** @param {FormData} formData @param {string} name */
function formText(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST({ request, locals, platform }) {
  if (!canManageCaseAssets(locals.user)) return new Response('Administrator access is required.', { status: 403 });
  if (!platform?.env?.DB) return new Response('The study database is not configured.', { status: 503 });

  const formData = await request.formData();
  const caseId = formText(formData, 'case_id');
  const intent = formText(formData, 'intent');
  const db = createDb(platform.env.DB);

  try {
    if (intent === 'assign-pair') {
      await assignSimpleStimulusRoles(db, {
        caseId,
        originalAssetId: formText(formData, 'original_asset_id'),
        alternativeAssetId: formText(formData, 'alternative_asset_id')
      });
    } else if (intent === 'set-original') {
      await setStimulusGroupOriginal(
        db,
        caseId,
        formText(formData, 'group_id'),
        formText(formData, 'option_id')
      );
    } else if (intent === 'add-alternative') {
      await convertCaseAssetToStimulusOption(
        db,
        formText(formData, 'group_id'),
        formText(formData, 'asset_id')
      );
    } else {
      throw new SimpleStimulusCurationInputError('Choose a valid stimulus role action.');
    }
  } catch (errorValue) {
    const clientError = errorValue instanceof SimpleStimulusCurationInputError || errorValue instanceof StimulusGroupInputError;
    if (!clientError) console.error('Stimulus role assignment failed.', errorValue);
    return new Response(
      clientError ? errorValue.message : 'Unable to save the stimulus roles.',
      { status: clientError ? 400 : 500 }
    );
  }

  redirect(303, `/admin/cases/${encodeURIComponent(caseId)}?status=stimulus-roles-saved#stimulus-curation`);
}
