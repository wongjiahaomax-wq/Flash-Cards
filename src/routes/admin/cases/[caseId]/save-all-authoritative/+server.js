import { json } from '@sveltejs/kit';

import { canManageCaseAssets, getAdminCaseData } from '$lib/server/db/case-assets.js';
import { listCaseImageQuestionSummaries } from '$lib/server/db/case-image-question-summaries.js';
import { listCaseQuestions } from '$lib/server/db/case-questions.js';
import { createDb } from '$lib/server/db/index.js';
import { getAdminStimulusData } from '$lib/server/db/stimulus-groups.js';

/** @param {unknown} input */
function saveAllDrafts(input) { return Array.isArray(input) && input.length > 0 && input.length <= 60 ? input : null; }
/** @param {unknown} input */
function snapshotFields(input) {
  if (!Array.isArray(input)) return {};
  return Object.fromEntries(input.filter((field) => field && typeof field.name === 'string').map((field) => [field.name, field.checked === false ? '' : String(field.value ?? '')]));
}
/** @param {string} label */
function missing(label) { throw new Error(`Unable to read authoritative ${label} after Save All.`); }

export async function POST({ request, locals, platform, params }) {
  if (!canManageCaseAssets(locals.user)) return json({ error: 'Administrator access is required.' }, { status: 403 });
  if (!platform?.env?.DB) return json({ error: 'The study database is not configured.' }, { status: 503 });

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Authoritative Save All readback requires valid draft data.' }, { status: 400 }); }
  const drafts = saveAllDrafts(body?.drafts);
  if (!drafts) return json({ error: 'Authoritative Save All readback requires one to 60 valid drafts.' }, { status: 400 });

  const db = createDb(platform.env.DB);
  try {
    const [manager, questions, groups] = await Promise.all([
      getAdminCaseData(db, params.caseId, { includeAvailable: false }),
      listCaseQuestions(db, params.caseId),
      getAdminStimulusData(db, params.caseId)
    ]);
    if (!manager) missing('Case');

    const contexts = [
      ...manager.attached.map((asset) => ({ assetId: asset.assetId, stimulusOptionId: null })),
      ...groups.flatMap((group) => group.options.map((option) => ({ assetId: option.assetId, stimulusOptionId: option.id })))
    ];
    const reusable = await listCaseImageQuestionSummaries(db, contexts);
    const reusableById = new Map(reusable.flatMap((summary) => summary.questions).map((question) => [question.id, question]));
    const optionById = new Map(groups.flatMap((group) => group.options).map((option) => [option.id, option]));
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const groupQuestionById = new Map(groups.flatMap((group) => group.questions).map((question) => [question.id, question]));
    const optionQuestionById = new Map(groups.flatMap((group) => group.optionQuestions).map((question) => [question.id, question]));

    const authoritative = drafts.map((draft) => {
      if (draft?.kind === 'case-details') {
        return {
          title: manager.case.title ?? '',
          vignetteMd: manager.case.vignetteMd ?? '',
          questionSelectionMode: manager.case.questionSelectionMode ?? 'automatic',
          questionCount: manager.case.questionCount ?? ''
        };
      }
      if (draft?.kind === 'question') {
        const fields = draft.fields ?? {};
        const question = questions.find((candidate) => candidate.id === String(fields.caseQuestionId ?? ''));
        if (!question) return missing('Case question');
        return {
          promptMd: question.promptMd ?? '',
          answerMd: question.answerMd ?? '',
          reusableForTopic: Boolean(question.reusableForTopic)
        };
      }
      if (draft?.kind !== 'form') return missing('Save All draft');
      const fields = snapshotFields(draft.fields);
      if (fields.case_id !== params.caseId) return missing('Case editor form');
      if (draft.action === '?/caption') {
        const asset = manager.attached.find((candidate) => candidate.assetId === fields.asset_id);
        if (!asset) return missing('Case image caption');
        return { caption: asset.captionMd ?? '' };
      }
      if (draft.action === '?/updateStimulusOptionCaption') {
        const option = optionById.get(fields.option_id);
        if (!option) return missing('image option caption');
        return { caption: option.captionMd ?? '' };
      }
      if (draft.action === '?/saveReusableImageAnswer') {
        const question = reusableById.get(fields.asset_question_id);
        if (!question) return missing('reusable image answer');
        return { answer_md: question.answerMd ?? '' };
      }
      if (draft.action === '?/updateStimulusGroup') {
        const group = groupById.get(fields.group_id);
        if (!group) return missing('image-set settings');
        return {
          name: group.name ?? '',
          specific_question_mode: group.specificQuestionMode ?? 'none',
          minimum_specific_questions: group.minimumSpecificQuestions ?? '',
          is_active: Boolean(group.isActive)
        };
      }
      if (draft.action === '?/saveStimulusOptionQuestion') {
        const question = optionQuestionById.get(fields.stimulus_question_id);
        if (!question) return missing('image-specific question');
        return { prompt_md: question.promptMd ?? '', answer_md: question.answerMd ?? '' };
      }
      if (draft.action === '?/saveStimulusGroupQuestion') {
        const question = groupQuestionById.get(fields.stimulus_question_id);
        if (!question) return missing('image-set question');
        return { prompt_md: question.promptMd ?? '', answer_md: question.answerMd ?? '' };
      }
      return missing('Case editor form');
    });

    return json({ authoritative });
  } catch (errorValue) {
    console.error('Case Save All authoritative readback failed.', errorValue);
    return json({ error: 'Unable to confirm the saved Case-editor values.' }, { status: 500 });
  }
}
