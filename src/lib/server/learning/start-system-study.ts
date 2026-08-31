import { startSystemStudySelectionReview } from '../db/learning.js';
import { StudyNavigationInputError } from '../db/study-navigation.ts';
import {
  QuestionPoolUnavailableError,
  isQuestionPoolMode,
  type QuestionPoolMode
} from './question-pool-mode.ts';
import {
  SystemStudySelectionError,
  type SystemStudySelectionRoute
} from './system-study-routes.ts';

export type StartSystemStudyFormState = {
  message: string;
  systemId: string;
  selectedRoutes: string[];
  questionPoolMode: string;
};

export type StartSystemStudyResult =
  | { ok: true; reviewId: string }
  | { ok: false; status: 400; form: StartSystemStudyFormState };

function parseRouteValue(value: string): SystemStudySelectionRoute | null {
  const separator = value.indexOf(':');
  if (separator < 1) return null;
  const routeType = value.slice(0, separator).trim();
  const routeId = value.slice(separator + 1).trim();
  if ((routeType !== 'topic' && routeType !== 'tag') || !routeId) return null;
  return { routeType, routeId };
}

function failure(
  message: string,
  state: Omit<StartSystemStudyFormState, 'message'>
): StartSystemStudyResult {
  return { ok: false, status: 400, form: { message, ...state } };
}

export async function startSystemStudyFromForm(input: {
  db: import('../db/index.js').LearningDb;
  userId: string;
  formData: FormData;
  rng?: () => number;
}): Promise<StartSystemStudyResult> {
  const systemValue = input.formData.get('systemId');
  const questionPoolValue = input.formData.get('questionPoolMode');
  const submittedRouteValues = input.formData.getAll('route');
  const systemId = typeof systemValue === 'string' ? systemValue.trim() : '';
  const questionPoolMode = typeof questionPoolValue === 'string' ? questionPoolValue : '';
  const selectedRoutes = submittedRouteValues.filter((value): value is string => typeof value === 'string');
  const state = { systemId, selectedRoutes, questionPoolMode };

  if (!systemId) return failure('A study System is required.', state);
  if (!isQuestionPoolMode(questionPoolMode)) {
    return failure('Choose Original questions or Expanded Learning.', state);
  }
  if (selectedRoutes.length !== submittedRouteValues.length) {
    return failure('Study selections must use Topic or curated Tag values.', state);
  }
  if (selectedRoutes.length === 0) {
    return failure('Select at least one Topic or curated Tag.', state);
  }

  const routes: SystemStudySelectionRoute[] = [];
  for (const value of selectedRoutes) {
    const route = parseRouteValue(value);
    if (!route) return failure('Study selections must use Topic or curated Tag values.', state);
    routes.push(route);
  }

  try {
    const reviewId = await startSystemStudySelectionReview({
      db: input.db,
      userId: input.userId,
      systemId,
      routes,
      questionPoolMode: questionPoolMode as QuestionPoolMode,
      rng: input.rng
    });
    if (!reviewId) return failure('No active study cases are available for this selection.', state);
    return { ok: true, reviewId };
  } catch (cause) {
    if (
      cause instanceof SystemStudySelectionError
      || cause instanceof StudyNavigationInputError
      || cause instanceof QuestionPoolUnavailableError
    ) {
      return failure(cause.message, state);
    }
    throw cause;
  }
}
