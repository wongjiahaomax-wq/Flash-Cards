// The merge planner deliberately carries heterogeneous raw D1 snapshots so the
// exact-state guard can compare every relevant column. Runtime invariants are
// enforced by the plan and the same-batch sentinel assertions below.
// @ts-nocheck

import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

import { deleteTeachingImage } from '../storage/media.js';
import {
  assetQuestions,
  assets,
  caseAssets,
  stimulusGroupOptions,
  stimulusOptionAssetQuestions
} from './schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class AssetDeduplicationInputError extends Error {
  /** @param {string} message */
  constructor(message) {
    super(message);
    this.name = 'AssetDeduplicationInputError';
  }
}

export class AssetDeduplicationStaleError extends AssetDeduplicationInputError {
  /** @param {string} message */
  constructor(message = 'The retained image context changed while this comparison was open. Refresh and certify the current evidence again.') {
    super(message);
    this.name = 'AssetDeduplicationStaleError';
  }
}

/** @param {LearningDb} db @param {string} statement @param {unknown[]} [params] */
async function rawRows(db, statement, params = []) {
  const result = await db.$client.prepare(statement).bind(...params).all();
  return result.results ?? [];
}

/** @param {LearningDb} db @param {string} statement @param {unknown[]} [params] */
async function rawCount(db, statement, params = []) {
  const rows = await rawRows(db, statement, params);
  return Number(rows[0]?.count ?? 0);
}

/** @param {unknown[]} values */
function placeholders(values) {
  return values.map(() => '?').join(', ');
}

/** @param {unknown} value */
function text(value) {
  return String(value ?? '').trim();
}

/** @param {unknown} value */
function storedValue(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'boolean') return value ? 1 : 0;
  return value === undefined ? null : value;
}

/**
 * Canonical answer equality is exact: only CRLF and lone CR are normalized to
 * LF. Whitespace and newline differences are meaningful authoring differences
 * and must not be trimmed or collapsed.
 *
 * @param {unknown} value
 */
function normalizedAnswer(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

/** @param {any} value */
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  }
  return storedValue(value);
}

/** @param {any} value */
function stableStringify(value) {
  return JSON.stringify(stable(value));
}

/** @param {string} value */
async function sha256(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {string[]} ids */
function inList(ids) {
  return ids.length ? `(${placeholders(ids)})` : '(NULL)';
}

/** @param {LearningDb} db @param {string[]} assetIds */
async function loadRawState(db, assetIds) {
  const assetParams = [...assetIds, ...assetIds, ...assetIds];
  const [assetRows, fixedRows, optionRows, assetQuestionRows, imageCollectionRows] = await Promise.all([
    rawRows(db, `SELECT * FROM assets WHERE id IN ${inList(assetIds)} OR deduplicated_into_asset_id IN ${inList(assetIds)} OR superseded_by_asset_id IN ${inList(assetIds)} ORDER BY id`, assetParams),
    rawRows(db, `
      SELECT ca.*, c.title AS case_title, c.vignette_md AS case_vignette_md,
        c.preview_session_id AS case_preview_session_id, c.is_active AS case_is_active,
        cc.concept_id AS primary_topic_id, concepts.name AS primary_topic_name
      FROM case_assets ca
      JOIN cases c ON c.id = ca.case_id
      LEFT JOIN case_concepts cc ON cc.case_id = c.id AND cc.role = 'primary'
      LEFT JOIN concepts ON concepts.id = cc.concept_id
      WHERE ca.asset_id IN ${inList(assetIds)}
      ORDER BY ca.case_id, ca.display_order, ca.asset_id
    `, assetIds),
    rawRows(db, `
      SELECT sgo.*, sg.case_id, sg.name AS group_name, sg.is_active AS group_is_active,
        sg.selection_count, sg.specific_question_mode, sg.minimum_specific_questions,
        c.title AS case_title, c.vignette_md AS case_vignette_md,
        c.preview_session_id AS case_preview_session_id, c.is_active AS case_is_active,
        cc.concept_id AS primary_topic_id, concepts.name AS primary_topic_name
      FROM stimulus_group_options sgo
      JOIN stimulus_groups sg ON sg.id = sgo.stimulus_group_id
      JOIN cases c ON c.id = sg.case_id
      LEFT JOIN case_concepts cc ON cc.case_id = c.id AND cc.role = 'primary'
      LEFT JOIN concepts ON concepts.id = cc.concept_id
      WHERE sgo.asset_id IN ${inList(assetIds)}
      ORDER BY sg.case_id, sgo.stimulus_group_id, sgo.display_order, sgo.id
    `, assetIds),
    rawRows(db, `
      SELECT aq.*, qp.prompt_md, qp.preview_session_id AS prompt_preview_session_id,
        qp.is_active AS prompt_is_active
      FROM asset_questions aq
      JOIN question_prompts qp ON qp.id = aq.question_prompt_id
      WHERE aq.asset_id IN ${inList(assetIds)}
      ORDER BY aq.asset_id, aq.question_prompt_id, aq.id
    `, assetIds),
    rawRows(db, `
      SELECT image_collections.*
      FROM image_collections
      WHERE image_collections.id IN (
        SELECT image_collection_id FROM assets WHERE id IN ${inList(assetIds)}
      )
      ORDER BY image_collections.id
    `, assetIds)
  ]);

  const caseIds = [...new Set([...fixedRows, ...optionRows].map((row) => row.case_id).filter(Boolean))].sort();
  const questionIds = [...new Set(assetQuestionRows.map((row) => row.id).filter(Boolean))].sort();
  const promptIds = [...new Set([
    ...assetQuestionRows.map((row) => row.question_prompt_id),
  ])].filter(Boolean).sort();

  const [casesRows, caseConceptRows, caseQuestionRows, groupsRows, graphOptionRows] = await Promise.all([
    caseIds.length ? rawRows(db, `SELECT * FROM cases WHERE id IN ${inList(caseIds)} ORDER BY id`, caseIds) : [],
    caseIds.length ? rawRows(db, `SELECT * FROM case_concepts WHERE case_id IN ${inList(caseIds)} AND role = 'primary' ORDER BY case_id, concept_id`, caseIds) : [],
    caseIds.length ? rawRows(db, `SELECT * FROM case_questions WHERE case_id IN ${inList(caseIds)} ORDER BY case_id, id`, caseIds) : [],
    caseIds.length ? rawRows(db, `SELECT * FROM stimulus_groups WHERE case_id IN ${inList(caseIds)} ORDER BY case_id, id`, caseIds) : [],
    caseIds.length ? rawRows(db, `
      SELECT sgo.*, sg.case_id, sg.name AS group_name, sg.is_active AS group_is_active,
        sg.selection_count, sg.specific_question_mode, sg.minimum_specific_questions,
        c.title AS case_title, c.vignette_md AS case_vignette_md,
        c.preview_session_id AS case_preview_session_id, c.is_active AS case_is_active,
        cc.concept_id AS primary_topic_id, concepts.name AS primary_topic_name
      FROM stimulus_group_options sgo
      JOIN stimulus_groups sg ON sg.id = sgo.stimulus_group_id
      JOIN cases c ON c.id = sg.case_id
      LEFT JOIN case_concepts cc ON cc.case_id = c.id AND cc.role = 'primary'
      LEFT JOIN concepts ON concepts.id = cc.concept_id
      WHERE sg.case_id IN ${inList(caseIds)}
      ORDER BY sg.case_id, sgo.stimulus_group_id, sgo.display_order, sgo.id
    `, caseIds) : []
  ]);

  const groupIds = [...new Set(groupsRows.map((row) => row.id).filter(Boolean))].sort();
  const optionIds = [...new Set(graphOptionRows.map((row) => row.id).filter(Boolean))].sort();
  const [groupQuestionRows, optionQuestionRows, graphOptInRows] = await Promise.all([
    groupIds.length ? rawRows(db, `SELECT * FROM stimulus_group_questions WHERE stimulus_group_id IN ${inList(groupIds)} ORDER BY stimulus_group_id, id`, groupIds) : [],
    optionIds.length ? rawRows(db, `SELECT * FROM stimulus_option_questions WHERE stimulus_group_option_id IN ${inList(optionIds)} ORDER BY stimulus_group_option_id, id`, optionIds) : [],
    optionIds.length ? rawRows(db, `
      SELECT soaq.*, sgo.stimulus_group_id, sg.case_id,
        sgo.asset_id AS option_asset_id, sgo.is_active AS option_is_active,
        sgo.removed_from_case, sg.is_active AS group_is_active,
        c.title AS case_title, c.preview_session_id AS case_preview_session_id,
        c.is_active AS case_is_active
      FROM stimulus_option_asset_questions soaq
      JOIN stimulus_group_options sgo ON sgo.id = soaq.stimulus_group_option_id
      JOIN stimulus_groups sg ON sg.id = sgo.stimulus_group_id
      JOIN cases c ON c.id = sg.case_id
      WHERE soaq.stimulus_group_option_id IN ${inList(optionIds)}
      ORDER BY soaq.asset_question_id, soaq.stimulus_group_option_id
    `, optionIds) : []
  ]);

  const graphQuestionIds = [...new Set([
    ...questionIds,
    ...graphOptInRows.map((row) => row.asset_question_id).filter(Boolean)
  ])].sort();
  const graphAssetQuestionRows = graphQuestionIds.length ? await rawRows(db, `
    SELECT aq.*, qp.prompt_md, qp.preview_session_id AS prompt_preview_session_id,
      qp.is_active AS prompt_is_active
    FROM asset_questions aq
    JOIN question_prompts qp ON qp.id = aq.question_prompt_id
    WHERE aq.id IN ${inList(graphQuestionIds)}
    ORDER BY aq.asset_id, aq.question_prompt_id, aq.id
  `, graphQuestionIds) : [];
  const optInRows = graphOptInRows.filter((row) => questionIds.includes(row.asset_question_id));

  const allConceptRows = await rawRows(db, 'SELECT * FROM concepts ORDER BY id');
  const conceptsById = new Map(allConceptRows.map((row) => [row.id, row]));
  const primaryConceptIds = caseConceptRows.map((row) => row.concept_id).filter(Boolean);
  const relevantConceptIds = new Set();
  for (const conceptId of primaryConceptIds) {
    let current = conceptsById.get(conceptId);
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      relevantConceptIds.add(current.id);
      current = conceptsById.get(current.parent_id);
    }
  }
  const conceptRows = allConceptRows.filter((row) => relevantConceptIds.has(row.id));
  promptIds.push(
    ...caseQuestionRows.map((row) => row.question_prompt_id),
    ...groupQuestionRows.map((row) => row.question_prompt_id),
    ...optionQuestionRows.map((row) => row.question_prompt_id),
    ...graphAssetQuestionRows.map((row) => row.question_prompt_id)
  );
  const uniquePromptIds = [...new Set(promptIds.filter(Boolean))].sort();
  const promptRows = uniquePromptIds.length
    ? await rawRows(db, `SELECT * FROM question_prompts WHERE id IN ${inList(uniquePromptIds)} ORDER BY id`, uniquePromptIds)
    : [];

  let legacyReview;
  try {
    const [reviews, reviewQuestions, reviewAssets] = await Promise.all([
      rawCount(db, 'SELECT count(*) AS count FROM reviews'),
      rawCount(db, 'SELECT count(*) AS count FROM review_questions'),
      rawCount(db, 'SELECT count(*) AS count FROM review_assets')
    ]);
    legacyReview = { readable: true, reviews, reviewQuestions, reviewAssets };
  } catch (error) {
    legacyReview = { readable: false, error: error instanceof Error ? error.message : 'unreadable' };
  }

  const duplicateId = assetIds[1];
  const duplicateKey = assetRows.find((row) => row.id === duplicateId)?.storage_key ?? null;
  let activeReviewAssets = [];
  let activeReviewQuestions = [];
  try {
    activeReviewAssets = await rawRows(db, `
      SELECT ara.id, ara.active_review_id, ara.asset_id, ara.storage_key_snapshot,
        ar.expires_at
      FROM active_review_assets ara
      LEFT JOIN active_reviews ar ON ar.id = ara.active_review_id
      WHERE ara.asset_id = ? OR ara.storage_key_snapshot = ?
      ORDER BY ara.id
    `, [duplicateId, duplicateKey]);
    activeReviewQuestions = await rawRows(db, `
      SELECT arq.id, arq.active_review_id, arq.source_asset_question_id,
        aq.asset_id, ar.expires_at
      FROM active_review_questions arq
      LEFT JOIN active_reviews ar ON ar.id = arq.active_review_id
      JOIN asset_questions aq ON aq.id = arq.source_asset_question_id
      WHERE aq.asset_id = ?
      ORDER BY arq.id
    `, [duplicateId]);
  } catch (error) {
    activeReviewAssets = [{ unreadable: true, error: error instanceof Error ? error.message : 'unreadable' }];
    activeReviewQuestions = [];
  }

  const tables = [
    ['assets', assetsScope(assetIds), assetRows],
    ['case_assets', inScope('asset_id', assetIds), fixedRows.map(stripFixedDerived)],
    ['stimulus_group_options', inScope('id', graphOptionRows.map((row) => row.id)), graphOptionRows.map(stripOptionDerived)],
    ['cases', inScope('id', caseIds), casesRows],
    ['case_concepts', `${inScope('case_id', caseIds)} AND role = 'primary'`, caseConceptRows],
    ['concepts', inScope('id', conceptRows.map((row) => row.id)), conceptRows],
    ['image_collections', inScope('id', imageCollectionRows.map((row) => row.id)), imageCollectionRows],
    ['case_questions', inScope('case_id', caseIds), caseQuestionRows],
    ['stimulus_groups', inScope('id', groupIds), groupsRows],
    ['stimulus_group_questions', inScope('stimulus_group_id', groupIds), groupQuestionRows],
    ['stimulus_option_questions', inScope('stimulus_group_option_id', optionIds), optionQuestionRows],
    ['question_prompts', inScope('id', uniquePromptIds), promptRows],
    ['asset_questions', inScope('id', graphQuestionIds), graphAssetQuestionRows.map(stripDerived)],
    ['stimulus_option_asset_questions', inScope('stimulus_group_option_id', optionIds), graphOptInRows.map(stripDerived)]
  ];

  return {
    assetRows,
    fixedRows,
    optionRows,
    graphOptionRows,
    casesRows,
    caseConceptRows,
    conceptRows,
    caseQuestionRows,
    groupsRows,
    groupQuestionRows,
    optionQuestionRows,
    promptRows,
    assetQuestionRows,
    graphAssetQuestionRows,
    imageCollectionRows,
    optInRows,
    graphOptInRows,
    activeReviewAssets,
    activeReviewQuestions,
    legacyReview,
    tables,
    caseIds,
    groupIds,
    optionIds,
    questionIds,
    graphQuestionIds,
    promptIds: uniquePromptIds
  };
}

/** @param {string} column @param {unknown[]} values */
function inScope(column, values) {
  if (!values.length) return '0';
  return `${column} IN ${inList(values)}`;
}

/** @param {string[]} ids */
function assetsScope(ids) {
  if (!ids.length) return '0';
  return `(id IN ${inList(ids)} OR deduplicated_into_asset_id IN ${inList(ids)} OR superseded_by_asset_id IN ${inList(ids)})`;
}

/** @param {any} row */
function stripDerived(row) {
  const copy = { ...row };
  for (const key of [
    'case_title', 'case_vignette_md', 'case_preview_session_id', 'case_is_active',
    'primary_topic_id', 'primary_topic_name', 'group_name', 'selection_count',
    'specific_question_mode', 'minimum_specific_questions', 'case_id', 'group_is_active',
    'option_asset_id', 'option_is_active', 'removed_from_case', 'stimulus_group_id', 'case_title', 'case_id',
    'prompt_md', 'prompt_preview_session_id', 'prompt_is_active',
    'case_preview_session_id', 'case_is_active'
  ]) {
    delete copy[key];
  }
  return copy;
}

/** @param {any} row */
function stripOptionDerived(row) {
  const copy = stripDerived(row);
  copy.stimulus_group_id = row.stimulus_group_id;
  copy.removed_from_case = row.removed_from_case;
  return copy;
}

/** @param {any} row */
function stripFixedDerived(row) {
  const copy = stripDerived(row);
  copy.case_id = row.case_id;
  return copy;
}

/** @param {any[]} rows @param {string} key */
function byKey(rows, key) {
  return new Map(rows.map((row) => [row[key], row]));
}

/** @param {any} row @param {Map<string, any>} conceptsById */
function taxonomyPath(row, conceptsById) {
  const result = [];
  const visited = new Set();
  let current = conceptsById.get(row.primary_topic_id);
  while (current && !visited.has(current.id)) {
    visited.add(current.id);
    result.push({ id: current.id, name: current.name, kind: current.kind, isActive: Boolean(current.is_active) });
    current = conceptsById.get(current.parent_id);
  }
  return result;
}

/** @param {any} raw @param {any} state */
function buildContext(raw, state) {
  const caseById = byKey(state.casesRows, 'id');
  const conceptById = byKey(state.conceptRows, 'id');
  const caseQuestionsByCase = new Map();
  for (const row of state.caseQuestionRows) {
    const list = caseQuestionsByCase.get(row.case_id) ?? [];
    const prompt = state.promptRows.find((candidate) => candidate.id === row.question_prompt_id);
    list.push({ ...row, promptMd: prompt?.prompt_md ?? null, promptIsActive: Boolean(prompt?.is_active) });
    caseQuestionsByCase.set(row.case_id, list);
  }
  const groupQuestionsByGroup = new Map();
  for (const row of state.groupQuestionRows) {
    const list = groupQuestionsByGroup.get(row.stimulus_group_id) ?? [];
    const prompt = state.promptRows.find((candidate) => candidate.id === row.question_prompt_id);
    list.push({ ...row, promptMd: prompt?.prompt_md ?? null, promptIsActive: Boolean(prompt?.is_active) });
    groupQuestionsByGroup.set(row.stimulus_group_id, list);
  }
  const optionQuestionsByOption = new Map();
  for (const row of state.optionQuestionRows) {
    const list = optionQuestionsByOption.get(row.stimulus_group_option_id) ?? [];
    const prompt = state.promptRows.find((candidate) => candidate.id === row.question_prompt_id);
    list.push({ ...row, promptMd: prompt?.prompt_md ?? null, promptIsActive: Boolean(prompt?.is_active) });
    optionQuestionsByOption.set(row.stimulus_group_option_id, list);
  }
  const contextFor = (row) => {
    const caseRow = caseById.get(row.case_id);
    return {
      case: caseRow ? {
        id: caseRow.id,
        title: caseRow.title,
        vignetteMd: caseRow.vignette_md,
        isActive: Boolean(caseRow.is_active),
        previewSessionId: caseRow.preview_session_id
      } : null,
      primaryTopic: row.primary_topic_id ? { id: row.primary_topic_id, name: row.primary_topic_name } : null,
      taxonomyPath: taxonomyPath(row, conceptById),
      systemAncestry: taxonomyPath(row, conceptById).filter((concept) => concept.kind === 'system'),
      caseQuestions: caseQuestionsByCase.get(row.case_id) ?? []
    };
  };
  if (raw.relationship === 'fixed') {
    return { ...raw, ...contextFor(raw), relationship: 'fixed' };
  }
  const group = state.groupsRows.find((candidate) => candidate.id === raw.stimulus_group_id);
  return {
    ...raw,
    ...contextFor(raw),
    relationship: 'stimulus-option',
    group: group ? { ...group, questions: groupQuestionsByGroup.get(group.id) ?? [] } : null,
    optionQuestions: optionQuestionsByOption.get(raw.id) ?? []
  };
}

/** @param {any[]} rows */
function sortRows(rows) {
  return [...rows].sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
}

/** @param {any} state @param {string[]} assetIds @param {{a?: boolean, b?: boolean}} [r2] */
async function createFingerprint(state, assetIds, r2 = {}) {
  const payload = {
    assets: sortRows(state.assetRows),
    caseAssets: sortRows(state.tables.find(([table]) => table === 'case_assets')?.[2] ?? []),
    stimulusGroupOptions: sortRows(state.tables.find(([table]) => table === 'stimulus_group_options')?.[2] ?? []),
    cases: sortRows(state.casesRows),
    caseConcepts: sortRows(state.caseConceptRows),
    concepts: sortRows(state.conceptRows),
    imageCollections: sortRows(state.imageCollectionRows ?? []),
    caseQuestions: sortRows(state.caseQuestionRows),
    stimulusGroups: sortRows(state.groupsRows),
    stimulusGroupQuestions: sortRows(state.groupQuestionRows),
    stimulusOptionQuestions: sortRows(state.optionQuestionRows),
    prompts: sortRows(state.promptRows),
    assetQuestions: sortRows(state.tables.find(([table]) => table === 'asset_questions')?.[2] ?? []),
    optIns: sortRows(state.tables.find(([table]) => table === 'stimulus_option_asset_questions')?.[2] ?? []),
    legacyReview: state.legacyReview,
    r2: { survivor: Boolean(r2.a), duplicate: Boolean(r2.b) },
    assetIds: [...assetIds].sort()
  };
  const serialized = stableStringify(payload);
  return { payload, serialized, fingerprint: await sha256(serialized) };
}

/** @param {{ db: LearningDb, survivorAssetId: string, duplicateAssetId: string, bucket?: R2Bucket }} input */
export async function getDuplicateAssetMergePlan({ db, survivorAssetId, duplicateAssetId, bucket }) {
  const survivorId = text(survivorAssetId);
  const duplicateId = text(duplicateAssetId);
  if (!survivorId || !duplicateId) throw new AssetDeduplicationInputError('Choose a survivor and a duplicate Asset.');
  if (survivorId === duplicateId) throw new AssetDeduplicationInputError('Choose two different image Assets.');
  const assetIds = [survivorId, duplicateId];
  const state = await loadRawState(db, assetIds);
  const assetById = byKey(state.assetRows.filter((row) => assetIds.includes(row.id)), 'id');
  const collectionById = byKey(state.imageCollectionRows, 'id');
  const withCollectionName = (asset) => asset
    ? { ...asset, image_collection_name: collectionById.get(asset.image_collection_id)?.name ?? null }
    : null;
  const survivor = withCollectionName(assetById.get(survivorId) ?? null);
  const duplicate = withCollectionName(assetById.get(duplicateId) ?? null);
  let r2 = { a: true, b: true, readable: true };
  if (bucket) {
    try {
      const [a, b] = await Promise.all([bucket.head(survivor?.storage_key ?? ''), bucket.head(duplicate?.storage_key ?? '')]);
      r2 = { a: Boolean(a), b: Boolean(b), readable: true };
    } catch (error) {
      r2 = { a: false, b: false, readable: false, error: error instanceof Error ? error.message : 'R2 storage could not be checked.' };
    }
  }

  const contexts = [
    ...state.fixedRows.map((row) => buildContext({ ...row, relationship: 'fixed' }, state)),
    ...state.optionRows.map((row) => buildContext({ ...row, relationship: 'stimulus-option' }, state))
  ];
  const contextsByAsset = new Map();
  for (const context of contexts) {
    const list = contextsByAsset.get(context.asset_id) ?? [];
    list.push(context);
    contextsByAsset.set(context.asset_id, list);
  }
  const optInsByQuestion = new Map();
  for (const row of state.optInRows) {
    const list = optInsByQuestion.get(row.asset_question_id) ?? [];
    list.push(row);
    optInsByQuestion.set(row.asset_question_id, list);
  }
  const reusableQuestions = state.assetQuestionRows.map((row) => ({
    ...row,
    assetId: row.asset_id,
    promptMd: row.prompt_md,
    optIns: optInsByQuestion.get(row.id) ?? []
  }));
  const aQuestions = reusableQuestions.filter((row) => row.asset_id === survivorId);
  const bQuestions = reusableQuestions.filter((row) => row.asset_id === duplicateId);
  const aByPrompt = byKey(aQuestions, 'question_prompt_id');
  const bByPrompt = byKey(bQuestions, 'question_prompt_id');
  const promptIds = [...new Set([...aByPrompt.keys(), ...bByPrompt.keys()])].sort();
  const questionConflicts = promptIds.map((promptId) => {
    const a = aByPrompt.get(promptId) ?? null;
    const b = bByPrompt.get(promptId) ?? null;
    const sameAnswer = Boolean(a && b && normalizedAnswer(a.answer_md) === normalizedAnswer(b.answer_md));
    return {
      questionPromptId: promptId,
      promptMd: a?.prompt_md ?? b?.prompt_md ?? null,
      survivor: a,
      duplicate: b,
      kind: !a ? 'duplicate-only' : !b ? 'survivor-only' : sameAnswer ? 'same-answer' : 'different-answer',
      resolutionRequired: Boolean(a && b && !sameAnswer),
      optInCount: (a ? (optInsByQuestion.get(a.id) ?? []).length : 0) + (b ? (optInsByQuestion.get(b.id) ?? []).length : 0)
    };
  });

  const aCaseIds = new Set(contexts.filter((context) => context.asset_id === survivorId).map((context) => context.case?.id).filter(Boolean));
  const bCaseIds = new Set(contexts.filter((context) => context.asset_id === duplicateId).map((context) => context.case?.id).filter(Boolean));
  const sameCaseIds = [...aCaseIds].filter((id) => bCaseIds.has(id)).sort();
  const previewContexts = contexts.filter((context) => context.asset_id === duplicateId && context.case?.previewSessionId);
  const incomingDedupe = state.assetRows.filter((row) => row.deduplicated_into_asset_id === duplicateId);
  const incomingSupersession = state.assetRows.filter((row) => row.superseded_by_asset_id === duplicateId);

  const prospective = prospectivePromptConflicts({ state, survivorId, duplicateId, aQuestions, bQuestions, questionConflicts });
  const blockers = [];
  if (!survivor) blockers.push({ code: 'survivor-missing', message: 'The selected survivor Asset no longer exists.' });
  if (!duplicate) blockers.push({ code: 'duplicate-missing', message: 'The selected duplicate Asset no longer exists.' });
  if (survivor && (survivor.type !== 'image' || survivor.preview_session_id || !survivor.is_active || survivor.deduplicated_into_asset_id || survivor.superseded_by_asset_id)) blockers.push({ code: 'survivor-ineligible', message: 'The survivor must be an active, production, non-superseded, non-tombstoned image Asset.' });
  if (duplicate && (duplicate.type !== 'image' || duplicate.preview_session_id || !duplicate.is_active || duplicate.deduplicated_into_asset_id || duplicate.superseded_by_asset_id)) blockers.push({ code: 'duplicate-ineligible', message: 'The duplicate must be an active, production, non-superseded, non-tombstoned image Asset.' });
  if (incomingDedupe.length) blockers.push({ code: 'duplicate-incoming-dedupe', message: 'The duplicate already has an incoming dedupe tombstone and cannot be claimed as a source.' });
  if (incomingSupersession.length) blockers.push({ code: 'duplicate-incoming-supersession', message: 'Another Asset still points to the duplicate through higher-resolution supersession.' });
  if (!r2.readable || !r2.a) blockers.push({ code: 'survivor-media-missing', message: 'The canonical survivor media could not be verified in R2.' });
  if (!r2.readable || !r2.b) blockers.push({ code: 'duplicate-media-missing', message: 'The duplicate media could not be verified in R2.' });
  if (!state.legacyReview.readable || state.legacyReview.reviews || state.legacyReview.reviewQuestions || state.legacyReview.reviewAssets) blockers.push({ code: 'legacy-review-sentinel', message: 'Legacy Review history is nonzero or unreadable; dedupe is blocked until the sentinel is clear.' });
  if (previewContexts.length) blockers.push({ code: 'preview-reference', message: `The duplicate is retained by ${previewContexts.length} Preview relationship${previewContexts.length === 1 ? '' : 's'}, including expired or cleanup-pending workspaces.` });
  if (state.activeReviewAssets.some((row) => row.unreadable) || state.activeReviewAssets.length || state.activeReviewQuestions.length) blockers.push({ code: 'active-review-reference', message: `The duplicate is still retained by ${state.activeReviewAssets.length + state.activeReviewQuestions.length} learner Review snapshot reference${state.activeReviewAssets.length + state.activeReviewQuestions.length === 1 ? '' : 's'}. Complete, discard, or replace the Review snapshot, then retry.` });
  if (sameCaseIds.length) blockers.push({ code: 'same-case-collision', message: `The two Assets are both retained in ${sameCaseIds.length} Case${sameCaseIds.length === 1 ? '' : 's'}; no same-Case collapse is supported.` });
  if (prospective.length) blockers.push({ code: 'prospective-prompt-conflict', message: 'The post-merge reusable-question graph would violate the cross-Stimulus-Group Prompt invariant.' });
  const questionResolutionBlockers = questionConflicts
    .filter((conflict) => conflict.resolutionRequired)
    .map((conflict) => ({ code: `question-conflict:${conflict.questionPromptId}`, message: `Prompt “${conflict.promptMd ?? conflict.questionPromptId}” has different survivor and duplicate answers; choose one current resolution.` }));

  const fingerprint = await createFingerprint(state, assetIds, r2);
  return {
    survivorAssetId: survivorId,
    duplicateAssetId: duplicateId,
    survivor,
    duplicate,
    r2,
    contexts,
    contextsByAsset: Object.fromEntries([...contextsByAsset.entries()].map(([id, rows]) => [id, sortRows(rows)])),
    reusableQuestions,
    questionConflicts,
    prospectivePromptConflicts: prospective,
    sameCaseIds,
    previewContexts,
    activeReviewAssets: state.activeReviewAssets,
    activeReviewQuestions: state.activeReviewQuestions,
    legacyReview: state.legacyReview,
    blockers,
    canMerge: blockers.length === 0 && questionResolutionBlockers.length === 0,
    questionResolutionBlockers,
    mergePlanFingerprint: fingerprint.fingerprint,
    fingerprintPayload: fingerprint.payload,
    authoringState: state
  };
}

/** @param {{ state: any, survivorId: string, duplicateId: string, aQuestions: any[], bQuestions: any[], questionConflicts: any[] }} input */
function prospectivePromptConflicts({ state, survivorId, duplicateId, aQuestions, bQuestions, questionConflicts }) {
  const map = new Map();
  const remap = new Map();
  const graphAssetQuestionRows = state.graphAssetQuestionRows ?? state.assetQuestionRows;
  const graphOptInRows = state.graphOptInRows ?? state.optInRows;
  const graphAssetQuestionsById = byKey(graphAssetQuestionRows, 'id');
  const aByPrompt = byKey(aQuestions, 'question_prompt_id');
  const bByPrompt = byKey(bQuestions, 'question_prompt_id');
  const canonicalActiveById = new Map();
  for (const conflict of questionConflicts) {
    const canonical = aByPrompt.get(conflict.questionPromptId) ?? bByPrompt.get(conflict.questionPromptId);
    if (!canonical) continue;
    remap.set(canonical.id, canonical.id);
    if (conflict.duplicate) remap.set(conflict.duplicate.id, canonical.id);
    canonicalActiveById.set(canonical.id, Boolean(conflict.survivor?.is_active || conflict.duplicate?.is_active));
  }
  for (const row of graphOptInRows) {
    const aq = graphAssetQuestionsById.get(row.asset_question_id);
    if (!aq) continue;
    const canonicalId = remap.get(row.asset_question_id) ?? row.asset_question_id;
    const canonical = graphAssetQuestionsById.get(canonicalId);
    if (!canonical) continue;
    const option = (state.graphOptionRows ?? state.optionRows).find((candidate) => candidate.id === row.stimulus_group_option_id);
    if (!option) continue;
    const key = `${option.case_id}:${canonical.question_prompt_id}`;
    const groups = map.get(key) ?? new Set();
    // The D1 cross-group trigger keys off `asset_questions.is_active` alone and
    // ignores `question_prompts.is_active`; an active reusable Question that is
    // OR-revived by the merge still reserves live Prompt ownership. Mirror that
    // guard exactly so preflight cannot certify a merge the batch then refuses.
    const canonicalIsActive = canonicalActiveById.has(canonical.id)
      ? canonicalActiveById.get(canonical.id)
      : Boolean(canonical.is_active);
    if (option.group_is_active && option.is_active && !option.removed_from_case && !option.case_preview_session_id && canonicalIsActive) groups.add(option.stimulus_group_id);
    map.set(key, groups);
  }
  for (const row of state.groupQuestionRows) {
    if (!row.is_active) continue;
    const group = state.groupsRows.find((candidate) => candidate.id === row.stimulus_group_id);
    if (!group?.is_active) continue;
    const key = `${group.case_id}:${row.question_prompt_id}`;
    const groups = map.get(key) ?? new Set();
    groups.add(group.id);
    map.set(key, groups);
  }
  for (const row of state.optionQuestionRows) {
    if (!row.is_active) continue;
    const option = (state.graphOptionRows ?? state.optionRows).find((candidate) => candidate.id === row.stimulus_group_option_id);
    if (!option?.group_is_active || !option.is_active || option.removed_from_case || option.case_preview_session_id) continue;
    const key = `${option.case_id}:${row.question_prompt_id}`;
    const groups = map.get(key) ?? new Set();
    groups.add(option.stimulus_group_id);
    map.set(key, groups);
  }
  return [...map.entries()].filter(([, groups]) => groups.size > 1).map(([key, groups]) => ({ key, groupIds: [...groups].sort() })).sort((a, b) => a.key.localeCompare(b.key));
}

/** @param {any} value */
function sqlValue(value) {
  return storedValue(value);
}

/** @param {string} name */
function identifier(name) {
  return sql.raw(`\`${name.replaceAll('`', '``')}\``);
}

/** @param {string} scope @param {any[]} params */
function boundScope(scope, params) {
  let index = 0;
  const parts = scope.split('?');
  const chunks = [];
  for (let i = 0; i < parts.length; i += 1) {
    chunks.push(sql.raw(parts[i]));
    if (i < parts.length - 1) chunks.push(sql`${sqlValue(params[index++])}`);
  }
  return sql.join(chunks, sql``);
}

/** @param {any} row */
function rowCondition(row) {
  const conditions = Object.entries(row).map(([column, value]) => sql`${identifier(column)} IS ${sqlValue(value)}`);
  return conditions.length ? sql.join(conditions, sql` AND `) : sql`1 = 1`;
}

/**
 * Build an exact row/value equality assertion. The scope strings use bound
 * parameters embedded by `scopeWithParams`; every expected row is also
 * matched column-for-column, so a changed, missing, or extra row fails the
 * NOT NULL sentinel update inside the same D1 batch.
 * @param {Array<[string, string, unknown[], any[]]>} tables
 */
function exactStateConditionWithParams(tables) {
  const conditions = [];
  for (const [table, scope, params, rows] of tables) {
    const tableId = identifier(table);
    conditions.push(sql`(SELECT count(*) FROM ${tableId} WHERE ${boundScope(scope, params)}) = ${rows.length}`);
    for (const row of rows) conditions.push(sql`EXISTS (SELECT 1 FROM ${tableId} WHERE ${rowCondition(row)})`);
  }
  return conditions.length ? sql.join(conditions, sql` AND `) : sql`1 = 1`;
}

/** @param {any} state @param {string[]} assetIds */
function stateTablesWithParams(state, assetIds) {
  const ids = assetIds;
  const threeIds = [...ids, ...ids, ...ids];
  const table = (name, scope, params, rows) => [name, scope, params, rows];
  return [
    table('assets', `id IN ${inList(ids)} OR deduplicated_into_asset_id IN ${inList(ids)} OR superseded_by_asset_id IN ${inList(ids)}`, threeIds, state.assetRows),
    table('case_assets', `asset_id IN ${inList(ids)}`, ids, state.fixedRows.map(stripFixedDerived)),
    table('stimulus_group_options', `stimulus_group_id IN ${inList(state.groupIds)}`, state.groupIds, state.graphOptionRows.map(stripOptionDerived)),
    table('stimulus_group_options', `asset_id IN ${inList(ids)}`, ids, state.optionRows.map(stripOptionDerived)),
    table('cases', `id IN ${inList(state.caseIds)}`, state.caseIds, state.casesRows),
    table('case_concepts', `${inScope('case_id', state.caseIds)} AND role = 'primary'`, state.caseIds, state.caseConceptRows),
    table('concepts', `id IN ${inList(state.conceptRows.map((row) => row.id))}`, state.conceptRows.map((row) => row.id), state.conceptRows),
    table('image_collections', `id IN ${inList(state.imageCollectionRows.map((row) => row.id))}`, state.imageCollectionRows.map((row) => row.id), state.imageCollectionRows),
    table('case_questions', `case_id IN ${inList(state.caseIds)}`, state.caseIds, state.caseQuestionRows),
    table('stimulus_groups', `case_id IN ${inList(state.caseIds)}`, state.caseIds, state.groupsRows),
    table('stimulus_group_questions', `stimulus_group_id IN ${inList(state.groupIds)}`, state.groupIds, state.groupQuestionRows),
    table('stimulus_option_questions', `stimulus_group_option_id IN ${inList(state.optionIds)}`, state.optionIds, state.optionQuestionRows),
    table('question_prompts', `id IN ${inList(state.promptIds)}`, state.promptIds, state.promptRows),
    table('asset_questions', `id IN ${inList(state.graphQuestionIds ?? state.questionIds)}`, state.graphQuestionIds ?? state.questionIds, (state.graphAssetQuestionRows ?? state.assetQuestionRows).map(stripDerived)),
    table('asset_questions', `asset_id IN ${inList(ids)}`, ids, state.assetQuestionRows.map(stripDerived)),
    table('stimulus_option_asset_questions', `stimulus_group_option_id IN ${inList(state.optionIds)}`, state.optionIds, (state.graphOptInRows ?? state.optInRows).map(stripDerived))
  ];
}

function legacyReviewZeroSql() {
  return sql`NOT EXISTS (SELECT 1 FROM reviews)
    AND NOT EXISTS (SELECT 1 FROM review_questions)
    AND NOT EXISTS (SELECT 1 FROM review_assets)`;
}

/** @param {any} state @param {string} duplicateId */
function activeReviewBlockerSql(state, duplicateId) {
  return sql`NOT EXISTS (
    SELECT 1 FROM active_review_assets ara
    WHERE ara.asset_id = ${duplicateId}
      OR ara.storage_key_snapshot = (SELECT storage_key FROM assets WHERE id = ${duplicateId})
  ) AND NOT EXISTS (
    SELECT 1
    FROM active_review_questions arq
    JOIN asset_questions aq ON aq.id = arq.source_asset_question_id
    WHERE aq.asset_id = ${duplicateId}
  )`;
}

/** @param {string} survivorId @param {string} duplicateId */
function noSameCaseCollisionSql(survivorId, duplicateId) {
  return sql`NOT EXISTS (
    SELECT 1
    FROM (
      SELECT case_id FROM case_assets WHERE asset_id = ${survivorId}
      UNION
      SELECT sg.case_id FROM stimulus_group_options sgo JOIN stimulus_groups sg ON sg.id = sgo.stimulus_group_id WHERE sgo.asset_id = ${survivorId}
    ) a
    JOIN (
      SELECT case_id FROM case_assets WHERE asset_id = ${duplicateId}
      UNION
      SELECT sg.case_id FROM stimulus_group_options sgo JOIN stimulus_groups sg ON sg.id = sgo.stimulus_group_id WHERE sgo.asset_id = ${duplicateId}
    ) b ON b.case_id = a.case_id
  )`;
}

/** @param {string} survivorId @param {string} duplicateId */
function noPreviewDuplicateSql(duplicateId) {
  return sql`NOT EXISTS (
    SELECT 1 FROM case_assets ca JOIN cases c ON c.id = ca.case_id
    WHERE ca.asset_id = ${duplicateId} AND c.preview_session_id IS NOT NULL
  ) AND NOT EXISTS (
    SELECT 1 FROM stimulus_group_options sgo
    JOIN stimulus_groups sg ON sg.id = sgo.stimulus_group_id
    JOIN cases c ON c.id = sg.case_id
    WHERE sgo.asset_id = ${duplicateId} AND c.preview_session_id IS NOT NULL
  )`;
}

/** @param {string} duplicateId */
function noDuplicateReferencesSql(duplicateId) {
  return sql`NOT EXISTS (SELECT 1 FROM case_assets WHERE asset_id = ${duplicateId})
    AND NOT EXISTS (SELECT 1 FROM stimulus_group_options WHERE asset_id = ${duplicateId})
    AND NOT EXISTS (SELECT 1 FROM asset_questions WHERE asset_id = ${duplicateId})
    AND NOT EXISTS (SELECT 1 FROM active_review_assets ara WHERE ara.asset_id = ${duplicateId} OR ara.storage_key_snapshot = (SELECT storage_key FROM assets WHERE id = ${duplicateId}))
    AND NOT EXISTS (
      SELECT 1 FROM active_review_questions arq
      JOIN asset_questions aq ON aq.id = arq.source_asset_question_id
      WHERE aq.asset_id = ${duplicateId}
    )
    AND NOT EXISTS (SELECT 1 FROM assets WHERE deduplicated_into_asset_id = ${duplicateId})
    AND NOT EXISTS (SELECT 1 FROM assets WHERE superseded_by_asset_id = ${duplicateId})
    AND NOT EXISTS (SELECT 1 FROM review_assets WHERE asset_id = ${duplicateId})`;
}

/** @param {LearningDb} db @param {any} plan @param {string} survivorId @param {string} duplicateId */
function batchStatements(db, plan, survivorId, duplicateId) {
  const state = plan.authoringState;
  const exact = exactStateConditionWithParams(stateTablesWithParams(state, [survivorId, duplicateId]));
  const sentinel = (condition, id = survivorId) => db.update(assets).set({ type: sql`CASE WHEN ${condition} THEN \`type\` ELSE NULL END` }).where(eq(assets.id, id));
  const now = new Date();
  const questionById = new Map(state.assetQuestionRows.map((row) => [row.id, row]));
  const aQuestions = state.assetQuestionRows.filter((row) => row.asset_id === survivorId);
  const bQuestions = state.assetQuestionRows.filter((row) => row.asset_id === duplicateId);
  const aByPrompt = byKey(aQuestions, 'question_prompt_id');
  const bByPrompt = byKey(bQuestions, 'question_prompt_id');
  const resolutions = plan.questionResolutions ?? {};
  const canonicalByQuestionId = new Map();
  const deleteQuestionIds = [];
  const moveQuestionIds = [];
  const questionUpdates = [];
  for (const promptId of new Set([...aByPrompt.keys(), ...bByPrompt.keys()])) {
    const a = aByPrompt.get(promptId);
    const b = bByPrompt.get(promptId);
    if (!a && b) {
      canonicalByQuestionId.set(b.id, b.id);
      moveQuestionIds.push(b.id);
      continue;
    }
    if (!a || !b) continue;
    canonicalByQuestionId.set(a.id, a.id);
    canonicalByQuestionId.set(b.id, a.id);
    deleteQuestionIds.push(b.id);
    const isActive = Boolean(a.is_active || b.is_active);
    const answer = normalizedAnswer(a.answer_md) === normalizedAnswer(b.answer_md)
      ? a.answer_md
      : resolutions[promptId] === 'duplicate' ? b.answer_md : a.answer_md;
    questionUpdates.push(db.update(assetQuestions).set({ answerMd: answer, isActive, updatedAt: now }).where(eq(assetQuestions.id, a.id)));
  }
  for (const id of moveQuestionIds) questionUpdates.push(db.update(assetQuestions).set({ assetId: survivorId, updatedAt: now }).where(eq(assetQuestions.id, id)));
  const affectedQuestionIds = [...new Set([...aQuestions, ...bQuestions].map((row) => row.id))];
  const optIns = state.optInRows
    .map((row) => ({ optionId: row.stimulus_group_option_id, assetQuestionId: canonicalByQuestionId.get(row.asset_question_id) ?? row.asset_question_id }))
    .filter((row) => row.assetQuestionId && questionById.has(row.assetQuestionId));
  const uniqueOptIns = [...new Map(optIns.map((row) => [`${row.optionId}:${row.assetQuestionId}`, row])).values()];
  const statements = [
    sentinel(exact),
    sentinel(legacyReviewZeroSql()),
    sentinel(activeReviewBlockerSql(state, duplicateId)),
    sentinel(noPreviewDuplicateSql(duplicateId)),
    sentinel(noSameCaseCollisionSql(survivorId, duplicateId)),
    sentinel(sql`EXISTS (SELECT 1 FROM assets a WHERE a.id = ${survivorId} AND a.type = 'image' AND a.preview_session_id IS NULL AND a.is_active = true AND a.deduplicated_into_asset_id IS NULL AND a.superseded_by_asset_id IS NULL)
      AND EXISTS (SELECT 1 FROM assets b WHERE b.id = ${duplicateId} AND b.type = 'image' AND b.preview_session_id IS NULL AND b.is_active = true AND b.deduplicated_into_asset_id IS NULL AND b.superseded_by_asset_id IS NULL)
      AND NOT EXISTS (SELECT 1 FROM assets incoming WHERE incoming.deduplicated_into_asset_id = ${duplicateId})
      AND NOT EXISTS (SELECT 1 FROM assets incoming WHERE incoming.superseded_by_asset_id = ${duplicateId})`),
    db.delete(stimulusOptionAssetQuestions).where(inArray(stimulusOptionAssetQuestions.assetQuestionId, affectedQuestionIds)),
    ...questionUpdates,
    db.delete(assetQuestions).where(inArray(assetQuestions.id, deleteQuestionIds)),
    db.update(caseAssets).set({ assetId: survivorId }).where(eq(caseAssets.assetId, duplicateId)),
    db.update(stimulusGroupOptions).set({ assetId: survivorId }).where(eq(stimulusGroupOptions.assetId, duplicateId)),
    ...uniqueOptIns.map((row) => db.insert(stimulusOptionAssetQuestions).values({ stimulusGroupOptionId: row.optionId, assetQuestionId: row.assetQuestionId })),
    sentinel(noDuplicateReferencesSql(duplicateId), duplicateId),
    db.update(assets).set({ isActive: false, deduplicatedIntoAssetId: survivorId, updatedAt: now }).where(and(
      eq(assets.id, duplicateId), eq(assets.isActive, true), isNull(assets.deduplicatedIntoAssetId), isNull(assets.supersededByAssetId)
    )),
    db.update(assets).set({ type: sql`CASE WHEN \`is_active\` = 0 AND \`deduplicated_into_asset_id\` = ${survivorId} THEN \`type\` ELSE NULL END` }).where(eq(assets.id, duplicateId))
  ];
  return statements;
}

/** @param {any} plan @param {Record<string, string> | undefined} resolutions */
function validateResolutions(plan, resolutions) {
  const expected = plan.questionConflicts.filter((conflict) => conflict.resolutionRequired).map((conflict) => conflict.questionPromptId).sort();
  const provided = Object.keys(resolutions ?? {}).sort();
  if (expected.join('|') !== provided.join('|') || provided.some((key) => !['survivor', 'duplicate'].includes(resolutions[key]))) {
    throw new AssetDeduplicationInputError('Provide exactly one current answer resolution for every differing reusable-question Prompt, with no stale or extra resolutions.');
  }
}

/** @param {{ db: LearningDb, bucket: R2Bucket, survivorAssetId: string, duplicateAssetId: string, mergePlanFingerprint: string, questionResolutions?: Record<string, string>, certificationConfirmed: boolean }} input */
export async function mergeDuplicateAssets(input) {
  if (!input?.db || !input?.bucket) throw new AssetDeduplicationInputError('Image storage is required for a certified Asset merge.');
  if (!input.certificationConfirmed) throw new AssetDeduplicationInputError('Confirm the clinical and educational interchangeability certification before merging.');
  const firstPlan = await getDuplicateAssetMergePlan({ db: input.db, bucket: input.bucket, survivorAssetId: input.survivorAssetId, duplicateAssetId: input.duplicateAssetId });
  if (firstPlan.mergePlanFingerprint !== text(input.mergePlanFingerprint)) throw new AssetDeduplicationStaleError();
  validateResolutions(firstPlan, input.questionResolutions);
  const plan = { ...firstPlan, questionResolutions: input.questionResolutions ?? {} };
  if (plan.blockers.length) throw new AssetDeduplicationInputError(plan.blockers[0]?.message ?? 'This Asset pair is not eligible for deduplication.');
  const [survivorObject, duplicateObject] = await Promise.all([
    input.bucket.head(plan.survivor.storage_key),
    input.bucket.head(plan.duplicate.storage_key)
  ]);
  if (!survivorObject || !duplicateObject) throw new AssetDeduplicationInputError('Both current teaching-image R2 objects must exist before the certified merge begins.');
  if (typeof input.db.batch !== 'function') throw new AssetDeduplicationInputError('Atomic D1 batch support is required for Asset deduplication.');
  try {
    await input.db.batch(batchStatements(input.db, plan, plan.survivorAssetId, plan.duplicateAssetId));
  } catch (error) {
    if (error instanceof Error && /NOT NULL constraint failed: assets\.type|deduplicat|Review|Prompt|no such table: (reviews|review_questions|review_assets)|no such column: .*review/i.test(error.message)) throw new AssetDeduplicationStaleError();
    throw error;
  }
  const cleanup = await cleanupDuplicateAsset({ db: input.db, bucket: input.bucket, duplicateAssetId: plan.duplicateAssetId });
  return { survivorAssetId: plan.survivorAssetId, duplicateAssetId: plan.duplicateAssetId, cleanup, planFingerprint: plan.mergePlanFingerprint };
}

/** @param {LearningDb} db @param {string} id */
async function loadAssetById(db, id) {
  return (await db.select({ id: assets.id, type: assets.type, storageKey: assets.storageKey, isActive: assets.isActive, previewSessionId: assets.previewSessionId, supersededByAssetId: assets.supersededByAssetId, deduplicatedIntoAssetId: assets.deduplicatedIntoAssetId }).from(assets).where(eq(assets.id, id)).limit(1))[0] ?? null;
}

/** @param {LearningDb} db @param {string} duplicateId */
async function cleanupBlockers(db, duplicateId) {
  const duplicate = await loadAssetById(db, duplicateId);
  if (!duplicate || duplicate.isActive || !duplicate.deduplicatedIntoAssetId) return { duplicate, reason: 'not-a-dedupe-tombstone' };
  const survivor = await loadAssetById(db, duplicate.deduplicatedIntoAssetId);
  if (!survivor) return { duplicate, survivor, reason: 'canonical-survivor-missing' };
  if (survivor.deduplicatedIntoAssetId) return { duplicate, survivor, reason: 'canonical-survivor-tombstoned' };
  if (await rawCount(db, 'SELECT count(*) AS count FROM assets WHERE deduplicated_into_asset_id = ?', [duplicateId])) return { duplicate, survivor, reason: 'incoming-dedupe-reference' };
  if (await rawCount(db, 'SELECT count(*) AS count FROM case_assets WHERE asset_id = ?', [duplicateId])) return { duplicate, survivor, reason: 'retained-case-reference' };
  if (await rawCount(db, 'SELECT count(*) AS count FROM stimulus_group_options WHERE asset_id = ?', [duplicateId])) return { duplicate, survivor, reason: 'retained-stimulus-reference' };
  if (await rawCount(db, 'SELECT count(*) AS count FROM asset_questions WHERE asset_id = ?', [duplicateId])) return { duplicate, survivor, reason: 'retained-asset-question' };
  if (await rawCount(db, 'SELECT count(*) AS count FROM active_review_assets ara WHERE ara.asset_id = ? OR ara.storage_key_snapshot = ?', [duplicateId, duplicate.storageKey])) return { duplicate, survivor, reason: 'active-review-reference' };
  if (await rawCount(db, 'SELECT count(*) AS count FROM active_review_questions arq JOIN asset_questions aq ON aq.id = arq.source_asset_question_id WHERE aq.asset_id = ?', [duplicateId])) return { duplicate, survivor, reason: 'active-review-question-reference' };
  if (await rawCount(db, 'SELECT count(*) AS count FROM assets WHERE superseded_by_asset_id = ?', [duplicateId])) return { duplicate, survivor, reason: 'incoming-supersession-reference' };
  if (duplicate.supersededByAssetId) return { duplicate, survivor, reason: 'outgoing-supersession-reference' };
  try {
    const legacy = await Promise.all([
      rawCount(db, 'SELECT count(*) AS count FROM reviews'),
      rawCount(db, 'SELECT count(*) AS count FROM review_questions'),
      rawCount(db, 'SELECT count(*) AS count FROM review_assets')
    ]);
    if (legacy.some(Boolean)) return { duplicate, survivor, reason: 'legacy-review-sentinel' };
  } catch (error) {
    return { duplicate, survivor, reason: 'legacy-review-sentinel-unreadable', error: error instanceof Error ? error.message : 'unreadable' };
  }
  return { duplicate, survivor, reason: null };
}

/** @param {{ db: LearningDb, bucket: R2Bucket, duplicateAssetId: string }} input */
export async function cleanupDuplicateAsset({ db, bucket, duplicateAssetId }) {
  const first = await cleanupBlockers(db, text(duplicateAssetId));
  if (first.reason === 'not-a-dedupe-tombstone') throw new AssetDeduplicationInputError('Only a dedupe cleanup-pending tombstone can use storage cleanup retry.');
  if (first.reason) return { status: 'blocked', reason: first.reason };
  const survivorObject = await bucket.head(first.survivor.storageKey);
  if (!survivorObject) return { status: 'blocked', reason: 'canonical-survivor-media-missing' };
  try {
    await deleteTeachingImage(bucket, first.duplicate.storageKey);
  } catch (error) {
    return { status: 'pending', reason: 'r2-delete-failed', error: error instanceof Error ? error.message : 'R2 delete failed.' };
  }
  try {
    const latest = await cleanupBlockers(db, text(duplicateAssetId));
    if (latest.reason) return { status: 'pending', reason: latest.reason };
    await db.delete(assets).where(and(eq(assets.id, text(duplicateAssetId)), eq(assets.isActive, false), eq(assets.deduplicatedIntoAssetId, first.survivor.id)));
    return { status: 'cleaned', deletedStorageKey: first.duplicate.storageKey };
  } catch (error) {
    return { status: 'pending', reason: 'tombstone-delete-failed', error: error instanceof Error ? error.message : 'D1 tombstone deletion failed.' };
  }
}

/**
 * @param {LearningDb} db
 * @param {R2Bucket | undefined} [bucket]
 * @returns {Promise<Array<{ duplicateId: string, duplicateName: string | null, survivorId: string, survivorName: string | null, claimedAt: string | null, reason: string | null }>>}
 */
export async function listPendingDuplicateCleanup(db, bucket) {
  const rows = await rawRows(db, `
    SELECT duplicate.id AS duplicate_id, duplicate.original_filename AS duplicate_name,
      survivor.id AS survivor_id, survivor.original_filename AS survivor_name,
      duplicate.updated_at AS claimed_at, duplicate.storage_key AS duplicate_storage_key,
      survivor.storage_key AS survivor_storage_key
    FROM assets duplicate
    JOIN assets survivor ON survivor.id = duplicate.deduplicated_into_asset_id
    WHERE duplicate.deduplicated_into_asset_id IS NOT NULL
    ORDER BY duplicate.updated_at DESC, duplicate.id
  `);
  const pending = [];
  for (const row of rows) {
    const duplicateId = String(row.duplicate_id);
    const blockers = await cleanupBlockers(db, duplicateId);
    let reason = blockers.reason;
    if (!reason) {
      if (!bucket) {
        reason = 'r2-delete-pending';
      } else {
        try {
          const survivorObject = await bucket.head(String(row.survivor_storage_key));
          if (!survivorObject) {
            reason = 'canonical-survivor-media-missing';
          } else {
            const duplicateObject = await bucket.head(String(row.duplicate_storage_key));
            reason = duplicateObject ? 'r2-delete-pending' : 'tombstone-delete-pending';
          }
        } catch {
          reason = 'r2-check-failed';
        }
      }
    }
    pending.push({
      duplicateId,
      duplicateName: row.duplicate_name == null ? null : String(row.duplicate_name),
      survivorId: String(row.survivor_id),
      survivorName: row.survivor_name == null ? null : String(row.survivor_name),
      claimedAt: row.claimed_at == null ? null : String(row.claimed_at),
      reason
    });
  }
  return pending;
}
