import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';

import {
  assetQuestions,
  caseConcepts,
  caseQuestions,
  cases,
  conceptQuestions,
  concepts,
  questionPrompts,
  stimulusGroupOptions,
  stimulusGroupQuestions,
  stimulusGroups,
  stimulusOptionQuestions
} from './schema.js';
import { caseQuestionTags, sharedQuestions, tags } from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {{ id: string, promptMd: string, isActive: boolean, updatedAt: Date }} QuestionLibraryPromptRow */

export const QUESTION_LIBRARY_PAGE_SIZE = 60;
const UNICODE_SEARCH_BATCH_SIZE = QUESTION_LIBRARY_PAGE_SIZE;

/**
 * @param {URLSearchParams | { get(name: string): string | null }} params
 * @returns {{ search: string, topicId: string, scope: 'all' | 'shared' | 'case', tagId: string }}
 */
export function parseQuestionLibraryFilters(params) {
  const scopeValue = params.get('scope');
  return {
    search: params.get('q')?.trim() ?? '',
    topicId: params.get('topic')?.trim() ?? '',
    scope: scopeValue === 'shared' || scopeValue === 'case' ? scopeValue : 'all',
    tagId: params.get('tag')?.trim() ?? ''
  };
}

/** @param {URLSearchParams | { get(name: string): string | null }} params */
export function parseQuestionLibraryPage(params) {
  const raw = Number(params.get('page') ?? 1);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 1;
}

const conceptUsageExists = sql`exists (
  select 1
  from concept_questions scope_cq
  join concepts scope_concept on scope_concept.id = scope_cq.concept_id
  where scope_cq.question_prompt_id = ${questionPrompts.id}
    and scope_cq.is_active = true
    and scope_concept.is_active = true
)`;

const caseUsageExists = sql`exists (
  select 1
  from case_questions scope_caseq
  join cases scope_case on scope_case.id = scope_caseq.case_id
  where scope_caseq.question_prompt_id = ${questionPrompts.id}
    and scope_caseq.is_active = true
    and scope_case.is_active = true
    and scope_case.preview_session_id is null
)`;

const groupUsageExists = sql`exists (
  select 1
  from stimulus_group_questions scope_groupq
  join stimulus_groups scope_group on scope_group.id = scope_groupq.stimulus_group_id
  join cases scope_group_case on scope_group_case.id = scope_group.case_id
  where scope_groupq.question_prompt_id = ${questionPrompts.id}
    and scope_groupq.is_active = true
    and scope_group.is_active = true
    and scope_group_case.is_active = true
    and scope_group_case.preview_session_id is null
)`;

const optionUsageExists = sql`exists (
  select 1
  from stimulus_option_questions scope_optionq
  join stimulus_group_options scope_option on scope_option.id = scope_optionq.stimulus_group_option_id
  join stimulus_groups scope_option_group on scope_option_group.id = scope_option.stimulus_group_id
  join cases scope_option_case on scope_option_case.id = scope_option_group.case_id
  where scope_optionq.question_prompt_id = ${questionPrompts.id}
    and scope_optionq.is_active = true
    and scope_option.is_active = true
    and scope_option.removed_from_case = false
    and scope_option_group.is_active = true
    and scope_option_case.is_active = true
    and scope_option_case.preview_session_id is null
)`;

const reusableSharedUsageExists = sql`exists (
  select 1
  from shared_questions scope_sharedq
  where scope_sharedq.question_prompt_id = ${questionPrompts.id}
    and scope_sharedq.is_active = true
)`;

const reusableAssetUsageExists = sql`exists (
  select 1
  from asset_questions scope_assetq
  where scope_assetq.question_prompt_id = ${questionPrompts.id}
    and scope_assetq.is_active = true
)`;

/** @param {string} search */
function questionSearchCondition(search) {
  return sql`(
    instr(lower(${questionPrompts.promptMd}), lower(${search})) > 0
    or exists (
      select 1 from concept_questions search_cq
      join concepts search_concept on search_concept.id = search_cq.concept_id
      where search_cq.question_prompt_id = ${questionPrompts.id}
        and search_cq.is_active = true and search_concept.is_active = true
        and instr(lower(search_cq.answer_md), lower(${search})) > 0
    )
    or exists (
      select 1 from case_questions search_caseq
      join cases search_case on search_case.id = search_caseq.case_id
      where search_caseq.question_prompt_id = ${questionPrompts.id}
        and search_caseq.is_active = true and search_case.is_active = true
        and search_case.preview_session_id is null
        and instr(lower(search_caseq.answer_md), lower(${search})) > 0
    )
    or exists (
      select 1 from stimulus_group_questions search_groupq
      join stimulus_groups search_group on search_group.id = search_groupq.stimulus_group_id
      join cases search_group_case on search_group_case.id = search_group.case_id
      where search_groupq.question_prompt_id = ${questionPrompts.id}
        and search_groupq.is_active = true and search_group.is_active = true
        and search_group_case.is_active = true and search_group_case.preview_session_id is null
        and instr(lower(search_groupq.answer_md), lower(${search})) > 0
    )
    or exists (
      select 1 from stimulus_option_questions search_optionq
      join stimulus_group_options search_option on search_option.id = search_optionq.stimulus_group_option_id
      join stimulus_groups search_option_group on search_option_group.id = search_option.stimulus_group_id
      join cases search_option_case on search_option_case.id = search_option_group.case_id
      where search_optionq.question_prompt_id = ${questionPrompts.id}
        and search_optionq.is_active = true and search_option.is_active = true
        and search_option.removed_from_case = false and search_option_group.is_active = true
        and search_option_case.is_active = true and search_option_case.preview_session_id is null
        and instr(lower(search_optionq.answer_md), lower(${search})) > 0
    )
    or exists (
      select 1 from shared_questions search_sharedq
      where search_sharedq.question_prompt_id = ${questionPrompts.id}
        and search_sharedq.is_active = true
        and instr(lower(search_sharedq.answer_md), lower(${search})) > 0
    )
    or exists (
      select 1 from asset_questions search_assetq
      where search_assetq.question_prompt_id = ${questionPrompts.id}
        and search_assetq.is_active = true
        and instr(lower(search_assetq.answer_md), lower(${search})) > 0
    )
  )`;
}

function questionHasNonAsciiSearchableTextCondition() {
  return sql`(
    length(${questionPrompts.promptMd}) != length(cast(${questionPrompts.promptMd} as blob))
    or exists (
      select 1 from concept_questions unicode_cq
      join concepts unicode_concept on unicode_concept.id = unicode_cq.concept_id
      where unicode_cq.question_prompt_id = ${questionPrompts.id}
        and unicode_cq.is_active = true and unicode_concept.is_active = true
        and length(unicode_cq.answer_md) != length(cast(unicode_cq.answer_md as blob))
    )
    or exists (
      select 1 from case_questions unicode_caseq
      join cases unicode_case on unicode_case.id = unicode_caseq.case_id
      where unicode_caseq.question_prompt_id = ${questionPrompts.id}
        and unicode_caseq.is_active = true and unicode_case.is_active = true
        and unicode_case.preview_session_id is null
        and length(unicode_caseq.answer_md) != length(cast(unicode_caseq.answer_md as blob))
    )
    or exists (
      select 1 from stimulus_group_questions unicode_groupq
      join stimulus_groups unicode_group on unicode_group.id = unicode_groupq.stimulus_group_id
      join cases unicode_group_case on unicode_group_case.id = unicode_group.case_id
      where unicode_groupq.question_prompt_id = ${questionPrompts.id}
        and unicode_groupq.is_active = true and unicode_group.is_active = true
        and unicode_group_case.is_active = true and unicode_group_case.preview_session_id is null
        and length(unicode_groupq.answer_md) != length(cast(unicode_groupq.answer_md as blob))
    )
    or exists (
      select 1 from stimulus_option_questions unicode_optionq
      join stimulus_group_options unicode_option on unicode_option.id = unicode_optionq.stimulus_group_option_id
      join stimulus_groups unicode_option_group on unicode_option_group.id = unicode_option.stimulus_group_id
      join cases unicode_option_case on unicode_option_case.id = unicode_option_group.case_id
      where unicode_optionq.question_prompt_id = ${questionPrompts.id}
        and unicode_optionq.is_active = true and unicode_option.is_active = true
        and unicode_option.removed_from_case = false and unicode_option_group.is_active = true
        and unicode_option_case.is_active = true and unicode_option_case.preview_session_id is null
        and length(unicode_optionq.answer_md) != length(cast(unicode_optionq.answer_md as blob))
    )
    or exists (
      select 1 from shared_questions unicode_sharedq
      where unicode_sharedq.question_prompt_id = ${questionPrompts.id}
        and unicode_sharedq.is_active = true
        and length(unicode_sharedq.answer_md) != length(cast(unicode_sharedq.answer_md as blob))
    )
    or exists (
      select 1 from asset_questions unicode_assetq
      where unicode_assetq.question_prompt_id = ${questionPrompts.id}
        and unicode_assetq.is_active = true
        and length(unicode_assetq.answer_md) != length(cast(unicode_assetq.answer_md as blob))
    )
  )`;
}

/** @param {string} topicId */
function questionTopicCondition(topicId) {
  return sql`(
    exists (
      select 1 from concept_questions topic_cq
      join concepts topic_concept on topic_concept.id = topic_cq.concept_id
      where topic_cq.question_prompt_id = ${questionPrompts.id}
        and topic_cq.concept_id = ${topicId}
        and topic_cq.is_active = true and topic_concept.is_active = true
    )
    or exists (
      select 1 from case_questions topic_caseq
      join cases topic_case on topic_case.id = topic_caseq.case_id
      join case_concepts topic_case_concept on topic_case_concept.case_id = topic_case.id and topic_case_concept.role = 'primary'
      where topic_caseq.question_prompt_id = ${questionPrompts.id}
        and topic_case_concept.concept_id = ${topicId}
        and topic_caseq.is_active = true and topic_case.is_active = true
        and topic_case.preview_session_id is null
    )
    or exists (
      select 1 from stimulus_group_questions topic_groupq
      join stimulus_groups topic_group on topic_group.id = topic_groupq.stimulus_group_id
      join cases topic_group_case on topic_group_case.id = topic_group.case_id
      join case_concepts topic_group_concept on topic_group_concept.case_id = topic_group_case.id and topic_group_concept.role = 'primary'
      where topic_groupq.question_prompt_id = ${questionPrompts.id}
        and topic_group_concept.concept_id = ${topicId}
        and topic_groupq.is_active = true and topic_group.is_active = true
        and topic_group_case.is_active = true and topic_group_case.preview_session_id is null
    )
    or exists (
      select 1 from stimulus_option_questions topic_optionq
      join stimulus_group_options topic_option on topic_option.id = topic_optionq.stimulus_group_option_id
      join stimulus_groups topic_option_group on topic_option_group.id = topic_option.stimulus_group_id
      join cases topic_option_case on topic_option_case.id = topic_option_group.case_id
      join case_concepts topic_option_concept on topic_option_concept.case_id = topic_option_case.id and topic_option_concept.role = 'primary'
      where topic_optionq.question_prompt_id = ${questionPrompts.id}
        and topic_option_concept.concept_id = ${topicId}
        and topic_optionq.is_active = true and topic_option.is_active = true
        and topic_option.removed_from_case = false and topic_option_group.is_active = true
        and topic_option_case.is_active = true and topic_option_case.preview_session_id is null
    )
  )`;
}

/** @param {string} tagId */
function questionTagCondition(tagId) {
  return sql`exists (
    select 1
    from case_question_tags filter_cqt
    join tags filter_tag on filter_tag.id = filter_cqt.tag_id
    join case_questions filter_caseq on filter_caseq.id = filter_cqt.case_question_id
    join cases filter_case on filter_case.id = filter_caseq.case_id
    where filter_caseq.question_prompt_id = ${questionPrompts.id}
      and filter_cqt.tag_id = ${tagId}
      and filter_tag.is_active = true
      and filter_caseq.is_active = true
      and filter_case.is_active = true
      and filter_case.preview_session_id is null
  )`;
}

/**
 * @param {{ search: string, topicId: string, scope: 'all' | 'shared' | 'case', tagId: string }} filters
 * @param {{ includeSearch?: boolean }} [options]
 */
function questionLibraryConditions(filters, options = {}) {
  const conditions = [eq(questionPrompts.isActive, true), isNull(questionPrompts.previewSessionId)];
  if (filters.search && options.includeSearch !== false) conditions.push(questionSearchCondition(filters.search));
  if (filters.topicId) conditions.push(questionTopicCondition(filters.topicId));
  if (filters.scope === 'shared') conditions.push(sql`(${conceptUsageExists} or ${reusableSharedUsageExists} or ${reusableAssetUsageExists})`);
  if (filters.scope === 'case') conditions.push(sql`(${caseUsageExists} or ${groupUsageExists} or ${optionUsageExists})`);
  if (filters.tagId) conditions.push(questionTagCondition(filters.tagId));
  return conditions;
}

/** @param {LearningDb} db @param {string[]} promptIds */
async function loadCurrentSearchAnswerRows(db, promptIds) {
  /** @type {Map<string, string[]>} */
  const answersByPrompt = new Map();
  if (!promptIds.length) return answersByPrompt;

  const [conceptRows, caseRows, groupRows, optionRows, sharedRows, assetRows] = await Promise.all([
    db.select({ promptId: conceptQuestions.questionPromptId, answerMd: conceptQuestions.answerMd })
      .from(conceptQuestions)
      .innerJoin(concepts, eq(concepts.id, conceptQuestions.conceptId))
      .where(and(inArray(conceptQuestions.questionPromptId, promptIds), eq(conceptQuestions.isActive, true), eq(concepts.isActive, true))),
    db.select({ promptId: caseQuestions.questionPromptId, answerMd: caseQuestions.answerMd })
      .from(caseQuestions)
      .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
      .where(and(inArray(caseQuestions.questionPromptId, promptIds), eq(caseQuestions.isActive, true), eq(cases.isActive, true), isNull(cases.previewSessionId))),
    db.select({ promptId: stimulusGroupQuestions.questionPromptId, answerMd: stimulusGroupQuestions.answerMd })
      .from(stimulusGroupQuestions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupQuestions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(inArray(stimulusGroupQuestions.questionPromptId, promptIds), eq(stimulusGroupQuestions.isActive, true), eq(stimulusGroups.isActive, true), eq(cases.isActive, true), isNull(cases.previewSessionId))),
    db.select({ promptId: stimulusOptionQuestions.questionPromptId, answerMd: stimulusOptionQuestions.answerMd })
      .from(stimulusOptionQuestions)
      .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionQuestions.stimulusGroupOptionId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .where(and(inArray(stimulusOptionQuestions.questionPromptId, promptIds), eq(stimulusOptionQuestions.isActive, true), eq(stimulusGroupOptions.isActive, true), eq(stimulusGroupOptions.removedFromCase, false), eq(stimulusGroups.isActive, true), eq(cases.isActive, true), isNull(cases.previewSessionId))),
    db.select({ promptId: sharedQuestions.questionPromptId, answerMd: sharedQuestions.answerMd })
      .from(sharedQuestions)
      .where(and(inArray(sharedQuestions.questionPromptId, promptIds), eq(sharedQuestions.isActive, true))),
    db.select({ promptId: assetQuestions.questionPromptId, answerMd: assetQuestions.answerMd })
      .from(assetQuestions)
      .where(and(inArray(assetQuestions.questionPromptId, promptIds), eq(assetQuestions.isActive, true)))
  ]);

  for (const row of [...conceptRows, ...caseRows, ...groupRows, ...optionRows, ...sharedRows, ...assetRows]) {
    const current = answersByPrompt.get(row.promptId) ?? [];
    current.push(row.answerMd);
    answersByPrompt.set(row.promptId, current);
  }
  return answersByPrompt;
}

/**
 * SQLite/D1 lower() only guarantees ASCII case folding. For a query that
 * contains non-ASCII text, scan only Prompts with a direct normalized match or
 * non-ASCII searchable content in fixed-size SQL batches, then verify the old
 * Unicode-aware substring rule with JavaScript toLocaleLowerCase(). This
 * preserves exact search semantics without reintroducing one unbounded
 * Prompt/relationship materialisation.
 *
 * @param {LearningDb} db
 * @param {{ search: string, topicId: string, scope: 'all' | 'shared' | 'case', tagId: string }} filters
 * @param {number} requestedPage
 * @param {number} pageSize
 */
async function getUnicodeSearchPromptPage(db, filters, requestedPage, pageSize) {
  const normalizedSearch = filters.search.toLocaleLowerCase();
  const candidateWhere = and(
    ...questionLibraryConditions(filters, { includeSearch: false }),
    sql`(${questionSearchCondition(normalizedSearch)} or ${questionHasNonAsciiSearchableTextCondition()})`
  );
  const requestedStart = (requestedPage - 1) * pageSize;
  const requestedEnd = requestedStart + pageSize;
  /** @type {QuestionLibraryPromptRow[]} */
  const requestedRows = [];
  /** @type {QuestionLibraryPromptRow[]} */
  const tailRows = [];
  let totalCount = 0;
  let candidateOffset = 0;

  while (true) {
    const candidateRows = await db.select({
      id: questionPrompts.id,
      promptMd: questionPrompts.promptMd,
      isActive: questionPrompts.isActive,
      updatedAt: questionPrompts.updatedAt
    })
      .from(questionPrompts)
      .where(candidateWhere)
      .orderBy(asc(questionPrompts.promptMd), asc(questionPrompts.id))
      .limit(UNICODE_SEARCH_BATCH_SIZE)
      .offset(candidateOffset);

    if (!candidateRows.length) break;
    const answersByPrompt = await loadCurrentSearchAnswerRows(db, candidateRows.map((row) => row.id));
    for (const prompt of candidateRows) {
      const searchableText = [prompt.promptMd, ...(answersByPrompt.get(prompt.id) ?? [])].join('\n').toLocaleLowerCase();
      if (!searchableText.includes(normalizedSearch)) continue;

      if (totalCount >= requestedStart && totalCount < requestedEnd) requestedRows.push(prompt);
      totalCount += 1;
      tailRows.push(prompt);
      if (tailRows.length > pageSize) tailRows.shift();
    }

    candidateOffset += candidateRows.length;
    if (candidateRows.length < UNICODE_SEARCH_BATCH_SIZE) break;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);
  let promptRows = requestedRows;
  if (page !== requestedPage && totalCount > 0) {
    const lastPageLength = totalCount % pageSize || pageSize;
    promptRows = tailRows.slice(-lastPageLength);
  }

  return { promptRows, totalCount, totalPages, page };
}

/** @param {LearningDb} db @param {string[]} promptIds */
async function loadPageUsageRows(db, promptIds) {
  if (!promptIds.length) {
    return { conceptRows: [], caseRows: [], groupRows: [], optionRows: [], sharedRows: [], assetRows: [], tagRows: [] };
  }

  const [conceptRows, caseRows, groupRows, optionRows, sharedRows, assetRows, tagRows] = await Promise.all([
    db.select({ promptId: conceptQuestions.questionPromptId, conceptId: concepts.id, conceptName: concepts.name })
      .from(conceptQuestions)
      .innerJoin(concepts, eq(concepts.id, conceptQuestions.conceptId))
      .where(and(inArray(conceptQuestions.questionPromptId, promptIds), eq(conceptQuestions.isActive, true), eq(concepts.isActive, true))),
    db.select({ promptId: caseQuestions.questionPromptId, conceptId: caseConcepts.conceptId, conceptName: concepts.name })
      .from(caseQuestions)
      .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
      .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(and(inArray(caseQuestions.questionPromptId, promptIds), eq(caseQuestions.isActive, true), eq(cases.isActive, true), isNull(cases.previewSessionId))),
    db.select({ promptId: stimulusGroupQuestions.questionPromptId, conceptId: caseConcepts.conceptId, conceptName: concepts.name })
      .from(stimulusGroupQuestions)
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupQuestions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(and(inArray(stimulusGroupQuestions.questionPromptId, promptIds), eq(stimulusGroupQuestions.isActive, true), eq(stimulusGroups.isActive, true), eq(cases.isActive, true), isNull(cases.previewSessionId))),
    db.select({ promptId: stimulusOptionQuestions.questionPromptId, conceptId: caseConcepts.conceptId, conceptName: concepts.name })
      .from(stimulusOptionQuestions)
      .innerJoin(stimulusGroupOptions, eq(stimulusGroupOptions.id, stimulusOptionQuestions.stimulusGroupOptionId))
      .innerJoin(stimulusGroups, eq(stimulusGroups.id, stimulusGroupOptions.stimulusGroupId))
      .innerJoin(cases, eq(cases.id, stimulusGroups.caseId))
      .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(and(inArray(stimulusOptionQuestions.questionPromptId, promptIds), eq(stimulusOptionQuestions.isActive, true), eq(stimulusGroupOptions.isActive, true), eq(stimulusGroupOptions.removedFromCase, false), eq(stimulusGroups.isActive, true), eq(cases.isActive, true), isNull(cases.previewSessionId))),
    db.select({ promptId: sharedQuestions.questionPromptId })
      .from(sharedQuestions)
      .where(and(inArray(sharedQuestions.questionPromptId, promptIds), eq(sharedQuestions.isActive, true))),
    db.select({ promptId: assetQuestions.questionPromptId })
      .from(assetQuestions)
      .where(and(inArray(assetQuestions.questionPromptId, promptIds), eq(assetQuestions.isActive, true))),
    db.select({ promptId: caseQuestions.questionPromptId, tagId: tags.id, tagName: tags.name })
      .from(caseQuestionTags)
      .innerJoin(tags, eq(tags.id, caseQuestionTags.tagId))
      .innerJoin(caseQuestions, eq(caseQuestions.id, caseQuestionTags.caseQuestionId))
      .innerJoin(cases, eq(cases.id, caseQuestions.caseId))
      .where(and(inArray(caseQuestions.questionPromptId, promptIds), eq(tags.isActive, true), eq(caseQuestions.isActive, true), eq(cases.isActive, true), isNull(cases.previewSessionId)))
      .orderBy(asc(tags.name), asc(tags.id))
  ]);

  return { conceptRows, caseRows, groupRows, optionRows, sharedRows, assetRows, tagRows };
}

/** @param {Map<string, Map<string, string>>} topicsByPrompt @param {{ promptId: string, conceptId: string | null, conceptName: string | null }[]} rows */
function addTopicRows(topicsByPrompt, rows) {
  for (const row of rows) {
    if (!row.conceptId || !row.conceptName) continue;
    const topics = topicsByPrompt.get(row.promptId) ?? new Map();
    topics.set(row.conceptId, row.conceptName);
    topicsByPrompt.set(row.promptId, topics);
  }
}

/** @param {Map<string, number>} counts @param {{ promptId: string }[]} rows */
function addCounts(counts, rows) {
  for (const row of rows) counts.set(row.promptId, (counts.get(row.promptId) ?? 0) + 1);
}

/**
 * Purpose-built bounded read model for /admin/questions.
 *
 * SQL identifies/counts matching production Prompt IDs first for normal ASCII
 * search/filter requests. Non-ASCII search keeps the old Unicode-aware
 * toLocaleLowerCase() semantics by scanning only direct/non-ASCII candidates
 * in fixed-size SQL batches. Final usage/topic/Tag materialisation remains
 * restricted to the visible Prompt IDs.
 *
 * @param {LearningDb} db
 * @param {{ search: string, topicId: string, scope: 'all' | 'shared' | 'case', tagId: string }} filters
 * @param {{ page?: number, pageSize?: number }} [options]
 */
export async function getQuestionLibraryPage(db, filters, options = {}) {
  const pageSize = Math.max(1, Math.min(Number(options.pageSize ?? QUESTION_LIBRARY_PAGE_SIZE) || QUESTION_LIBRARY_PAGE_SIZE, QUESTION_LIBRARY_PAGE_SIZE));
  const requestedPage = Math.max(1, Number(options.page ?? 1) || 1);

  /** @type {QuestionLibraryPromptRow[]} */
  let promptRows;
  let totalCount;
  let totalPages;
  let page;

  if (filters.search && /[^\x00-\x7f]/u.test(filters.search)) {
    ({ promptRows, totalCount, totalPages, page } = await getUnicodeSearchPromptPage(db, filters, requestedPage, pageSize));
  } else {
    const where = and(...questionLibraryConditions(filters));
    const countRows = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(questionPrompts).where(where);
    totalCount = Number(countRows[0]?.count ?? 0);
    totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
    page = Math.min(requestedPage, totalPages);

    promptRows = await db.select({
      id: questionPrompts.id,
      promptMd: questionPrompts.promptMd,
      isActive: questionPrompts.isActive,
      updatedAt: questionPrompts.updatedAt
    })
      .from(questionPrompts)
      .where(where)
      .orderBy(asc(questionPrompts.promptMd), asc(questionPrompts.id))
      .limit(pageSize)
      .offset((page - 1) * pageSize);
  }

  const promptIds = promptRows.map((row) => row.id);
  const usage = await loadPageUsageRows(db, promptIds);
  const conceptCounts = new Map();
  const caseCounts = new Map();
  const groupCounts = new Map();
  const optionCounts = new Map();
  const sharedCounts = new Map();
  const assetCounts = new Map();
  addCounts(conceptCounts, usage.conceptRows);
  addCounts(caseCounts, usage.caseRows);
  addCounts(groupCounts, usage.groupRows);
  addCounts(optionCounts, usage.optionRows);
  addCounts(sharedCounts, usage.sharedRows);
  addCounts(assetCounts, usage.assetRows);

  const topicsByPrompt = new Map();
  addTopicRows(topicsByPrompt, usage.conceptRows);
  addTopicRows(topicsByPrompt, usage.caseRows);
  addTopicRows(topicsByPrompt, usage.groupRows);
  addTopicRows(topicsByPrompt, usage.optionRows);

  const tagsByPrompt = new Map();
  for (const tag of usage.tagRows) {
    const current = tagsByPrompt.get(tag.promptId) ?? new Map();
    current.set(tag.tagId, tag.tagName);
    tagsByPrompt.set(tag.promptId, current);
  }

  const rows = promptRows.map((prompt) => {
    const conceptUsageCount = conceptCounts.get(prompt.id) ?? 0;
    const caseUsageCount = caseCounts.get(prompt.id) ?? 0;
    const stimulusGroupUsageCount = groupCounts.get(prompt.id) ?? 0;
    const stimulusOptionUsageCount = optionCounts.get(prompt.id) ?? 0;
    const sharedQuestionUsageCount = sharedCounts.get(prompt.id) ?? 0;
    const assetQuestionUsageCount = assetCounts.get(prompt.id) ?? 0;
    const hasSharedUsage = conceptUsageCount + sharedQuestionUsageCount + assetQuestionUsageCount > 0;
    const hasCaseUsage = caseUsageCount + stimulusGroupUsageCount + stimulusOptionUsageCount > 0;
    const scope = hasSharedUsage && hasCaseUsage ? 'Shared + Case-specific' : hasSharedUsage ? 'Shared' : hasCaseUsage ? 'Case-specific' : 'Unused';
    return {
      ...prompt,
      usageCount: conceptUsageCount + caseUsageCount + stimulusGroupUsageCount + stimulusOptionUsageCount + sharedQuestionUsageCount + assetQuestionUsageCount,
      conceptUsageCount,
      caseUsageCount,
      stimulusGroupUsageCount,
      stimulusOptionUsageCount,
      sharedQuestionUsageCount,
      assetQuestionUsageCount,
      hasSharedUsage,
      hasCaseUsage,
      scope,
      topicNames: [...(topicsByPrompt.get(prompt.id)?.values() ?? [])],
      tags: [...(tagsByPrompt.get(prompt.id)?.entries() ?? [])].map(([id, name]) => ({ id, name }))
    };
  });

  return { rows, totalCount, totalPages, page, pageSize, requestedPage };
}
