import { fail, redirect } from '@sveltejs/kit';

import { createDb } from '$lib/server/db/index.js';
import { canManageCaseAssets } from '$lib/server/db/case-assets.js';
import { listSharedQuestionTagUsages, listTagsWithSharedQuestionUsage } from '$lib/server/db/tag-shared-usage.js';
import { listSystemTagExposures } from '$lib/server/db/system-tag-usage.ts';
import {
  addCaseQuestionTag,
  addCaseTag,
  createTag,
  listActiveTags,
  listCaseQuestionTagAssignments,
  listCaseTagAssignments,
  listTaggableCaseQuestions,
  listTaggableCases,
  removeCaseQuestionTag,
  removeCaseTag,
  renameTag,
  setTagActive,
  TagInputError
} from '$lib/server/db/tag-library.js';

export async function load({ platform, url }) {
  const filters = {
    search: url.searchParams.get('q')?.trim() ?? '',
    tagId: url.searchParams.get('tag')?.trim() ?? ''
  };
  if (!platform?.env?.DB) {
    return {
      tags: [],
      activeTags: [],
      cases: [],
      caseQuestions: [],
      caseAssignments: [],
      questionAssignments: [],
      sharedQuestionUsages: [],
      systemExposures: [],
      filters
    };
  }

  const db = createDb(platform.env.DB);
  const [tagRows, activeTags, cases, caseQuestions, caseAssignments, questionAssignments, sharedQuestionUsages, systemExposures] = await Promise.all([
    listTagsWithSharedQuestionUsage(db, { search: filters.search }),
    listActiveTags(db),
    listTaggableCases(db),
    listTaggableCaseQuestions(db),
    listCaseTagAssignments(db),
    listCaseQuestionTagAssignments(db),
    listSharedQuestionTagUsages(db),
    listSystemTagExposures(db)
  ]);

  const filteredSystemExposures = filters.tagId
    ? systemExposures.filter((exposure) => exposure.tagId === filters.tagId)
    : systemExposures;

  return {
    tags: tagRows.map((tag) => ({
      ...tag,
      systems: systemExposures.filter((exposure) => exposure.tagId === tag.id)
    })),
    activeTags,
    cases,
    caseQuestions,
    caseAssignments: filters.tagId
      ? caseAssignments.filter((assignment) => assignment.tagId === filters.tagId)
      : caseAssignments,
    questionAssignments: filters.tagId
      ? questionAssignments.filter((assignment) => assignment.tagId === filters.tagId)
      : questionAssignments,
    sharedQuestionUsages: filters.tagId
      ? sharedQuestionUsages.filter((usage) => usage.tagId === filters.tagId)
      : sharedQuestionUsages,
    systemExposures: filteredSystemExposures,
    filters
  };
}

/** @param {App.Locals['user']} user */
function canManageTags(user) {
  return canManageCaseAssets(user);
}

/** @param {FormData} formData @param {string} name */
function formValue(formData, name) {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** @param {unknown} error */
function tagActionFailure(error) {
  return fail(error instanceof TagInputError ? 400 : 500, {
    error: error instanceof TagInputError ? error.message : 'Unable to update Tags.'
  });
}

/** @param {string} status */
function successRedirect(status) {
  redirect(303, `/admin/tags?status=${encodeURIComponent(status)}`);
}

export const actions = {
  createTag: async ({ request, locals, platform }) => {
    if (!canManageTags(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await createTag(createDb(platform.env.DB), formValue(formData, 'name'));
    } catch (error) {
      return tagActionFailure(error);
    }
    successRedirect('tag-created');
  },

  renameTag: async ({ request, locals, platform }) => {
    if (!canManageTags(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await renameTag(createDb(platform.env.DB), {
        tagId: formValue(formData, 'tag_id'),
        name: formValue(formData, 'name')
      });
    } catch (error) {
      return tagActionFailure(error);
    }
    successRedirect('tag-renamed');
  },

  setTagActive: async ({ request, locals, platform }) => {
    if (!canManageTags(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await setTagActive(createDb(platform.env.DB), {
        tagId: formValue(formData, 'tag_id'),
        isActive: formValue(formData, 'is_active')
      });
    } catch (error) {
      return tagActionFailure(error);
    }
    successRedirect('tag-status-updated');
  },

  addCaseTag: async ({ request, locals, platform }) => {
    if (!canManageTags(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await addCaseTag(createDb(platform.env.DB), {
        caseId: formValue(formData, 'case_id'),
        tagId: formValue(formData, 'tag_id')
      });
    } catch (error) {
      return tagActionFailure(error);
    }
    successRedirect('case-tag-added');
  },

  removeCaseTag: async ({ request, locals, platform }) => {
    if (!canManageTags(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await removeCaseTag(createDb(platform.env.DB), {
        caseId: formValue(formData, 'case_id'),
        tagId: formValue(formData, 'tag_id')
      });
    } catch (error) {
      return tagActionFailure(error);
    }
    successRedirect('case-tag-removed');
  },

  addCaseQuestionTag: async ({ request, locals, platform }) => {
    if (!canManageTags(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await addCaseQuestionTag(createDb(platform.env.DB), {
        caseQuestionId: formValue(formData, 'case_question_id'),
        tagId: formValue(formData, 'tag_id')
      });
    } catch (error) {
      return tagActionFailure(error);
    }
    successRedirect('question-tag-added');
  },

  removeCaseQuestionTag: async ({ request, locals, platform }) => {
    if (!canManageTags(locals.user)) return fail(403, { error: 'Administrator access is required.' });
    if (!platform?.env?.DB) return fail(503, { error: 'The study database is not configured.' });
    const formData = await request.formData();
    try {
      await removeCaseQuestionTag(createDb(platform.env.DB), {
        caseQuestionId: formValue(formData, 'case_question_id'),
        tagId: formValue(formData, 'tag_id')
      });
    } catch (error) {
      return tagActionFailure(error);
    }
    successRedirect('question-tag-removed');
  }
};
