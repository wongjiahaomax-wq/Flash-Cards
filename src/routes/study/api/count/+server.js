import { createDb } from '$lib/server/db/index.js';
import {
  resolveMultiSystemStudySelection,
  StudyNavigationInputError
} from '$lib/server/db/study-navigation.ts';
import { learnerStudyAccessError } from '$lib/server/learning/learner-study-runtime.js';
import {
  parseMultiSystemStudyScopeFromForm,
  StudyRunFormInputError
} from '$lib/server/learning/plan-system-study.ts';
import { MultiSystemStudyScopeError } from '$lib/server/learning/multi-system-study-scope.ts';
import { SystemStudySelectionError } from '$lib/server/learning/system-study-routes.ts';

/** @param {unknown} body @param {number} [status] */
function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

export async function POST({ locals, platform, request }) {
  const access = learnerStudyAccessError(locals.user, platform?.env);
  if (access) return json({ message: access.message }, access.status);
  if (!locals.user || !platform?.env?.DB) {
    return json({ message: 'Study database is not configured.' }, 503);
  }

  try {
    const formData = await request.formData();
    const systems = parseMultiSystemStudyScopeFromForm(formData);
    const selection = await resolveMultiSystemStudySelection(createDb(platform.env.DB), { systems });
    return json({
      candidateCount: selection.candidates.length,
      selectedSystemCount: selection.runScope.systems.length,
      runScope: selection.runScope
    });
  } catch (cause) {
    if (
      cause instanceof StudyRunFormInputError
      || cause instanceof MultiSystemStudyScopeError
      || cause instanceof SystemStudySelectionError
      || cause instanceof StudyNavigationInputError
    ) {
      return json({ message: cause.message }, 400);
    }
    throw cause;
  }
}
