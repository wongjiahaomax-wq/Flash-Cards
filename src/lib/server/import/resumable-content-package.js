// Resumable reviewed-package execution. The browser drives one bounded step at
// a time; D1 owns phase/cursor progress. The existing package parser and
// deterministic identity helpers remain authoritative for package syntax and
// application/R2 identity.
// @ts-nocheck

import { and, eq } from 'drizzle-orm';

import { createDb } from '../db/index.js';
import {
  assets,
  caseAssets,
  caseConcepts,
  caseQuestions,
  cases,
  conceptQuestions,
  concepts,
  questionPrompts
} from '../db/schema.js';
import { deleteTeachingImage, putTeachingImage } from '../storage/media.js';
import {
  ContentPackageError,
  deterministicApplicationId,
  deterministicStorageKey,
  importPackageDigest,
  parseImportPackage
} from './reviewed-content-package.js';
import {
  deleteStagedImportPackage,
  importPackageStorageKey,
  readStagedImportPackage,
  stageImportPackage
} from '../storage/import-packages.js';

export const IMPORT_ITEMS_PER_REQUEST = 7;
export const IMPORT_D1_OPERATION_BUDGET = 40;
export const IMPORT_LEASE_MS = 30_000;

export const VALIDATION_PHASES = [
  'validate_topics',
  'validate_question_prompts',
  'validate_cases',
  'validate_assets',
  'validate_case_topics',
  'validate_case_assets',
  'validate_case_questions',
  'validate_topic_questions'
];

export const WRITE_PHASES = [
  'import_topics',
  'import_question_prompts',
  'import_cases',
  'import_assets',
  'import_case_topics',
  'import_case_assets',
  'import_case_questions',
  'import_topic_questions'
];

export const IMPORT_PHASES = [...VALIDATION_PHASES, ...WRITE_PHASES, 'finalize'];

const RESUMABLE_STATUSES = new Set(['validating', 'ready', 'importing', 'failed']);

/** @param {any} row @param {Record<string, unknown>} expected */
function fieldsMatch(row, expected) {
  return Object.entries(expected).every(([key, value]) => row?.[key] === value);
}

/** @param {any} db @param {any} table @param {string} id */
async function rowById(db, table, id) {
  return (await db.select().from(table).where(eq(table.id, id)).limit(1))[0] ?? null;
}

/** @param {any} db @param {any} table @param {string} id @param {string} label @param {string[]} issues */
async function requireExisting(db, table, id, label, issues) {
  const row = await rowById(db, table, id);
  if (!row) issues.push(`${label} references missing application ID ${id}.`);
  return row;
}

/** @param {any[]} items @param {(item:any)=>string} keyFor @param {(item:any)=>string} labelFor @param {string[]} issues */
function rejectDuplicateCreates(items, keyFor, labelFor, issues) {
  const seen = new Map();
  for (const item of items) {
    if (item.operation !== 'create') continue;
    const key = keyFor(item);
    const previous = seen.get(key);
    if (previous) issues.push(`${labelFor(item)} conflicts with ${labelFor(previous)} inside the same package.`);
    else seen.set(key, item);
  }
}

/** @param {any[]} topics */
function topologicallyOrderTopics(topics) {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  const orderedCreates = [];
  const visiting = new Set();
  const visited = new Set();
  function visit(topic) {
    if (visited.has(topic.id)) return;
    if (visiting.has(topic.id)) throw new ContentPackageError(`Topic parent relationship contains a cycle at ${topic.id}.`);
    visiting.add(topic.id);
    const parent = topic.parentTopicId ? byId.get(topic.parentTopicId) : null;
    if (parent?.operation === 'create') visit(parent);
    visiting.delete(topic.id);
    visited.add(topic.id);
    orderedCreates.push(topic);
  }
  for (const topic of topics) if (topic.operation === 'create') visit(topic);
  return [...topics.filter((topic) => topic.operation !== 'create'), ...orderedCreates];
}

/** @param {any} parsed */
function staticIssues(parsed) {
  const issues = [];
  const manifest = parsed.manifest;
  const collections = ['topics', 'cases', 'assets', 'caseAssets', 'questionPrompts', 'caseQuestions', 'topicQuestions'];
  const sets = Object.fromEntries(collections.map((name) => [name, new Set(manifest[name].map((item) => item.id))]));

  for (const topic of manifest.topics) {
    if (topic.parentTopicId && !sets.topics.has(topic.parentTopicId)) issues.push(`Topic ${topic.id} references missing parent Topic ${topic.parentTopicId}.`);
  }
  for (const item of manifest.cases) {
    if (item.primaryTopicId && !sets.topics.has(item.primaryTopicId)) issues.push(`Case ${item.id} references missing primary Topic ${item.primaryTopicId}.`);
    for (const topicId of item.secondaryTopicIds) if (!sets.topics.has(topicId)) issues.push(`Case ${item.id} references missing secondary Topic ${topicId}.`);
  }
  for (const item of manifest.caseAssets) {
    if (!sets.cases.has(item.caseId)) issues.push(`Case Asset ${item.id} references missing Case ${item.caseId}.`);
    if (!sets.assets.has(item.assetId)) issues.push(`Case Asset ${item.id} references missing Asset ${item.assetId}.`);
  }
  for (const item of manifest.caseQuestions) {
    if (!sets.cases.has(item.owner)) issues.push(`Case Question ${item.id} references missing Case ${item.owner}.`);
    if (!sets.questionPrompts.has(item.questionPromptId)) issues.push(`Case Question ${item.id} references missing Question Prompt ${item.questionPromptId}.`);
  }
  for (const item of manifest.topicQuestions) {
    if (!sets.topics.has(item.owner)) issues.push(`Topic Question ${item.id} references missing Topic ${item.owner}.`);
    if (!sets.questionPrompts.has(item.questionPromptId)) issues.push(`Topic Question ${item.id} references missing Question Prompt ${item.questionPromptId}.`);
  }

  const topicById = new Map(manifest.topics.map((item) => [item.id, item]));
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visiting.has(id)) {
      issues.push(`Topic parent relationship contains a cycle at ${id}.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const parent = topicById.get(id)?.parentTopicId;
    if (parent && topicById.has(parent)) visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for (const topic of manifest.topics) visit(topic.id);

  const skippedTopics = new Set(manifest.topics.filter((item) => item.operation === 'skip').map((item) => item.id));
  const skippedCases = new Set(manifest.cases.filter((item) => item.operation === 'skip').map((item) => item.id));
  const skippedAssets = new Set(manifest.assets.filter((item) => item.operation === 'skip').map((item) => item.id));
  const skippedPrompts = new Set(manifest.questionPrompts.filter((item) => item.operation === 'skip').map((item) => item.id));

  for (const topic of manifest.topics) if (topic.operation !== 'skip' && topic.parentTopicId && skippedTopics.has(topic.parentTopicId)) {
    issues.push(`Topic ${topic.id} references skipped parent Topic ${topic.parentTopicId}; mark the parent use if this package depends on it.`);
  }
  for (const item of manifest.cases) {
    if (item.operation === 'skip') continue;
    if (item.primaryTopicId && skippedTopics.has(item.primaryTopicId)) issues.push(`Case ${item.id} references skipped primary Topic ${item.primaryTopicId}; mark the Topic use if this package depends on it.`);
    for (const topicId of item.secondaryTopicIds) if (skippedTopics.has(topicId)) issues.push(`Case ${item.id} references skipped secondary Topic ${topicId}; mark the Topic use if this package depends on it.`);
  }
  for (const item of manifest.caseAssets) {
    if (item.operation === 'skip') continue;
    if (skippedCases.has(item.caseId)) issues.push(`Case Asset ${item.id} references skipped Case ${item.caseId}; mark the Case use if this package should attach an Asset to it.`);
    if (skippedAssets.has(item.assetId)) issues.push(`Case Asset ${item.id} references skipped Asset ${item.assetId}; mark the Asset use if this package depends on it.`);
  }
  for (const item of manifest.caseQuestions) {
    if (item.operation === 'skip') continue;
    if (skippedCases.has(item.owner)) issues.push(`Case Question ${item.id} references skipped Case ${item.owner}; mark the Case use if this package should add or reuse a Question on it.`);
    if (skippedPrompts.has(item.questionPromptId)) issues.push(`Case Question ${item.id} references skipped Question Prompt ${item.questionPromptId}; mark the Prompt use if this package depends on it.`);
  }
  for (const item of manifest.topicQuestions) {
    if (item.operation === 'skip') continue;
    if (skippedTopics.has(item.owner)) issues.push(`Topic Question ${item.id} references skipped Topic ${item.owner}; mark the Topic use if this package should add or reuse a Question on it.`);
    if (skippedPrompts.has(item.questionPromptId)) issues.push(`Topic Question ${item.id} references skipped Question Prompt ${item.questionPromptId}; mark the Prompt use if this package depends on it.`);
  }

  rejectDuplicateCreates(manifest.topics, (item) => item.slug, (item) => `Topic ${item.id} slug ${item.slug}`, issues);
  rejectDuplicateCreates(manifest.caseAssets, (item) => `${item.caseId}\0asset\0${item.assetId}`, (item) => `Case Asset ${item.id}`, issues);
  rejectDuplicateCreates(manifest.caseAssets, (item) => `${item.caseId}\0order\0${item.displayOrder}`, (item) => `Case Asset ${item.id} display order ${item.displayOrder}`, issues);
  rejectDuplicateCreates(manifest.caseQuestions, (item) => `${item.owner}\0${item.questionPromptId}`, (item) => `Case Question ${item.id}`, issues);
  rejectDuplicateCreates(manifest.topicQuestions, (item) => `${item.owner}\0${item.questionPromptId}`, (item) => `Topic Question ${item.id}`, issues);
  return issues;
}

/** @param {any} manifest */
function previewFor(manifest) {
  const count = (collection, operation) => manifest[collection].filter((item) => item.operation === operation).length;
  return {
    topics: { create: count('topics', 'create'), use: count('topics', 'use'), skip: count('topics', 'skip') },
    cases: { create: count('cases', 'create'), use: count('cases', 'use'), skip: count('cases', 'skip') },
    imagesToUpload: manifest.assets.filter((item) => item.operation === 'create').length,
    assets: { create: count('assets', 'create'), use: count('assets', 'use'), skip: count('assets', 'skip') },
    questionPrompts: manifest.questionPrompts.length,
    caseQuestions: manifest.caseQuestions.filter((item) => item.operation !== 'skip').length,
    topicQuestions: manifest.topicQuestions.filter((item) => item.operation !== 'skip').length,
    primaryTopicLinks: manifest.cases.filter((item) => item.operation !== 'skip' && item.primaryTopicId).length,
    secondaryTopicLinks: manifest.cases.filter((item) => item.operation !== 'skip').reduce((total, item) => total + item.secondaryTopicIds.length, 0),
    caseAssetLinks: manifest.caseAssets.filter((item) => item.operation !== 'skip').length
  };
}

/** @param {any} parsed */
export function prepareResumableImportPlan(parsed) {
  if (parsed?.hardeningVersion !== 1) throw new ContentPackageError('The package must pass the hardened ZIP preflight before import planning.');
  const issues = staticIssues(parsed);
  if (issues.length) throw new ContentPackageError('The package did not pass static validation.', issues);

  parsed.manifest.topics = topologicallyOrderTopics(parsed.manifest.topics);
  const manifest = parsed.manifest;
  const resolved = {
    topics: new Map(manifest.topics.map((item) => [item.id, item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'topic', item.id) : item.applicationId])),
    cases: new Map(manifest.cases.map((item) => [item.id, item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'case', item.id) : item.applicationId])),
    assets: new Map(manifest.assets.map((item) => [item.id, item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'asset', item.id) : item.applicationId])),
    questionPrompts: new Map(manifest.questionPrompts.map((item) => [item.id, item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'prompt', item.id) : item.applicationId])),
    caseQuestions: new Map(manifest.caseQuestions.map((item) => [item.id, item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'case-question', item.id) : item.applicationId])),
    topicQuestions: new Map(manifest.topicQuestions.map((item) => [item.id, item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'topic-question', item.id) : item.applicationId]))
  };
  const caseTopics = [];
  for (const item of manifest.cases) {
    if (item.operation === 'skip') continue;
    if (item.primaryTopicId) caseTopics.push({ caseItem: item, caseId: item.id, topicId: item.primaryTopicId, role: 'primary' });
    for (const topicId of item.secondaryTopicIds) caseTopics.push({ caseItem: item, caseId: item.id, topicId, role: 'secondary' });
  }
  return { parsed, manifest, resolved, caseTopics, preview: previewFor(manifest), warnings: [] };
}

/** @param {any} plan @param {string} phase */
export function itemsForPhase(plan, phase) {
  if (phase.endsWith('topics') && !phase.endsWith('case_topics')) return plan.manifest.topics;
  if (phase.endsWith('question_prompts')) return plan.manifest.questionPrompts;
  if (phase.endsWith('cases')) return plan.manifest.cases;
  if (phase.endsWith('assets') && !phase.endsWith('case_assets')) return plan.manifest.assets;
  if (phase.endsWith('case_topics')) return plan.caseTopics;
  if (phase.endsWith('case_assets')) return plan.manifest.caseAssets;
  if (phase.endsWith('case_questions')) return plan.manifest.caseQuestions;
  if (phase.endsWith('topic_questions')) return plan.manifest.topicQuestions;
  if (phase === 'finalize') return [];
  throw new ContentPackageError(`Unknown import phase: ${phase}.`);
}

/** @param {any} plan */
export function importPlanTotalCount(plan) {
  return VALIDATION_PHASES.reduce((n, phase) => n + itemsForPhase(plan, phase).length, 0) +
    WRITE_PHASES.reduce((n, phase) => n + itemsForPhase(plan, phase).length, 0);
}

/** @param {any} db @param {any} plan @param {any} item */
async function validateTopic(db, plan, item) {
  const issues = [];
  const appId = plan.resolved.topics.get(item.id);
  const row = item.operation === 'create' ? await rowById(db, concepts, appId) : await requireExisting(db, concepts, appId, `Topic ${item.id}`, issues);
  const expectedParentId = item.parentTopicId ? plan.resolved.topics.get(item.parentTopicId) : null;
  if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, name: item.name, slug: item.slug, descriptionMd: item.descriptionMd, parentId: expectedParentId, isActive: item.isActive })) issues.push(`Topic ${item.id} conflicts with an existing application row.`);
  if (item.operation === 'create') {
    const slugRow = (await db.select({ id: concepts.id }).from(concepts).where(eq(concepts.slug, item.slug)).limit(1))[0] ?? null;
    if (slugRow && slugRow.id !== appId) issues.push(`Topic ${item.id} slug ${item.slug} is already used by application Topic ${slugRow.id}.`);
  }
  return issues;
}

/** @param {any} db @param {any} plan @param {any} item */
async function validatePrompt(db, plan, item) {
  const issues = [];
  const appId = plan.resolved.questionPrompts.get(item.id);
  const row = item.operation === 'create' ? await rowById(db, questionPrompts, appId) : await requireExisting(db, questionPrompts, appId, `Question Prompt ${item.id}`, issues);
  if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, promptMd: item.promptMd, isActive: item.isActive })) issues.push(`Question Prompt ${item.id} conflicts with an existing application row.`);
  return issues;
}

/** @param {any} db @param {any} plan @param {any} item */
async function validateCase(db, plan, item) {
  const issues = [];
  const appId = plan.resolved.cases.get(item.id);
  const row = item.operation === 'create' ? await rowById(db, cases, appId) : await requireExisting(db, cases, appId, `Case ${item.id}`, issues);
  if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, title: item.title, vignetteMd: item.vignetteMd, questionSelectionMode: item.questionSelectionMode, questionCount: item.questionCount, isActive: item.isActive })) issues.push(`Case ${item.id} conflicts with an existing application row.`);
  if (item.operation !== 'skip' && item.primaryTopicId && !plan.resolved.topics.get(item.primaryTopicId)) issues.push(`Case ${item.id} cannot resolve its primary Topic.`);
  return issues;
}

/** @param {any} db @param {any} plan @param {any} item */
async function validateAsset(db, plan, item) {
  const issues = [];
  const appId = plan.resolved.assets.get(item.id);
  const row = item.operation === 'create' ? await rowById(db, assets, appId) : await requireExisting(db, assets, appId, `Asset ${item.id}`, issues);
  if (row && row.type !== 'image') issues.push(`Asset ${item.id} application ID ${appId} is not an image Asset.`);
  const expectedStorageKey = item.operation === 'create' ? deterministicStorageKey(plan.manifest.packageId, item.id, item.mimeType) : null;
  if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, storageKey: expectedStorageKey, mimeType: item.mimeType, altText: item.altText, originalFilename: item.originalFilename, sourceLabel: item.sourceLabel, sourceUrl: item.sourceUrl, licence: item.licence, isActive: item.isActive })) issues.push(`Asset ${item.id} conflicts with an existing application row.`);
  if (item.operation === 'create') {
    const storageRow = (await db.select({ id: assets.id }).from(assets).where(eq(assets.storageKey, expectedStorageKey)).limit(1))[0] ?? null;
    if (storageRow && storageRow.id !== appId) issues.push(`Asset ${item.id} deterministic storage key is already used by application Asset ${storageRow.id}.`);
  }
  return issues;
}

/** @param {any} db @param {any} plan @param {any} link */
async function validateCaseTopic(db, plan, link) {
  if (link.caseItem.operation !== 'use') return [];
  const caseId = plan.resolved.cases.get(link.caseId);
  const conceptId = plan.resolved.topics.get(link.topicId);
  const row = (await db.select().from(caseConcepts).where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, conceptId))).limit(1))[0] ?? null;
  return row && row.role === link.role ? [] : [`Existing Case ${link.caseId} does not have the explicitly requested ${link.role} Topic relationship ${link.topicId}.`];
}

/** @param {any} db @param {any} plan @param {any} item */
async function validateCaseAsset(db, plan, item) {
  if (item.operation === 'skip') return [];
  const issues = [];
  const caseId = plan.resolved.cases.get(item.caseId);
  const assetId = plan.resolved.assets.get(item.assetId);
  const existing = (await db.select().from(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId))).limit(1))[0] ?? null;
  if (item.operation === 'use' && !existing) issues.push(`Case Asset ${item.id} is marked use but the relationship does not exist.`);
  if (item.operation === 'create' && existing && !fieldsMatch(existing, { displayOrder: item.displayOrder, captionMd: item.captionMd })) issues.push(`Case Asset ${item.id} conflicts with an existing relationship.`);
  if (item.operation === 'create') {
    const orderRow = (await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.displayOrder, item.displayOrder))).limit(1))[0] ?? null;
    if (orderRow && orderRow.assetId !== assetId) issues.push(`Case Asset ${item.id} display order ${item.displayOrder} is already occupied in the target Case.`);
  }
  return issues;
}

/** @param {any} db @param {any} plan @param {any} item */
async function validateCaseQuestion(db, plan, item) {
  const issues = [];
  const caseId = plan.resolved.cases.get(item.owner);
  const promptId = plan.resolved.questionPrompts.get(item.questionPromptId);
  if (!caseId || !promptId) return issues;
  const appId = item.operation === 'create' ? plan.resolved.caseQuestions.get(item.id) : item.applicationId;
  const row = item.operation === 'create' ? await rowById(db, caseQuestions, appId) : await requireExisting(db, caseQuestions, appId, `Case Question ${item.id}`, issues);
  if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, caseId, questionPromptId: promptId, answerMd: item.answerMd, isActive: item.isActive })) issues.push(`Case Question ${item.id} conflicts with an existing application row.`);
  if (item.operation !== 'create' && row && (row.caseId !== caseId || row.questionPromptId !== promptId)) issues.push(`Case Question ${item.id} application ID does not belong to the declared Case and Question Prompt.`);
  if (item.operation === 'create') {
    const uniqueRow = (await db.select({ id: caseQuestions.id }).from(caseQuestions).where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, promptId))).limit(1))[0] ?? null;
    if (uniqueRow && uniqueRow.id !== appId) issues.push(`Case Question ${item.id} conflicts with an existing Case/Prompt relationship ${uniqueRow.id}.`);
  }
  return issues;
}

/** @param {any} db @param {any} plan @param {any} item */
async function validateTopicQuestion(db, plan, item) {
  const issues = [];
  const conceptId = plan.resolved.topics.get(item.owner);
  const promptId = plan.resolved.questionPrompts.get(item.questionPromptId);
  if (!conceptId || !promptId) return issues;
  const appId = item.operation === 'create' ? plan.resolved.topicQuestions.get(item.id) : item.applicationId;
  const row = item.operation === 'create' ? await rowById(db, conceptQuestions, appId) : await requireExisting(db, conceptQuestions, appId, `Topic Question ${item.id}`, issues);
  if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, conceptId, questionPromptId: promptId, answerMd: item.answerMd, inheritToDescendants: item.inheritToDescendants, isActive: item.isActive })) issues.push(`Topic Question ${item.id} conflicts with an existing application row.`);
  if (item.operation !== 'create' && row && (row.conceptId !== conceptId || row.questionPromptId !== promptId)) issues.push(`Topic Question ${item.id} application ID does not belong to the declared Topic and Question Prompt.`);
  if (item.operation === 'create') {
    const uniqueRow = (await db.select({ id: conceptQuestions.id }).from(conceptQuestions).where(and(eq(conceptQuestions.conceptId, conceptId), eq(conceptQuestions.questionPromptId, promptId))).limit(1))[0] ?? null;
    if (uniqueRow && uniqueRow.id !== appId) issues.push(`Topic Question ${item.id} conflicts with an existing Topic/Prompt relationship ${uniqueRow.id}.`);
  }
  return issues;
}

/** @param {any} db @param {any} plan @param {string} phase @param {any} item */
async function validateItem(db, plan, phase, item) {
  if (phase.endsWith('case_topics')) return validateCaseTopic(db, plan, item);
  if (phase.endsWith('case_assets')) return validateCaseAsset(db, plan, item);
  if (phase.endsWith('case_questions')) return validateCaseQuestion(db, plan, item);
  if (phase.endsWith('topic_questions')) return validateTopicQuestion(db, plan, item);
  if (phase.endsWith('question_prompts')) return validatePrompt(db, plan, item);
  if (phase.endsWith('topics')) return validateTopic(db, plan, item);
  if (phase.endsWith('cases')) return validateCase(db, plan, item);
  if (phase.endsWith('assets')) return validateAsset(db, plan, item);
  throw new ContentPackageError(`No validator exists for phase ${phase}.`);
}

/** @param {any} db @param {any} plan @param {string} phase @param {number} cursor @param {number} [limit] */
export async function validateImportChunk(db, plan, phase, cursor, limit = IMPORT_ITEMS_PER_REQUEST) {
  if (!VALIDATION_PHASES.includes(phase)) throw new ContentPackageError(`Phase ${phase} is not a validation phase.`);
  const items = itemsForPhase(plan, phase);
  const end = Math.min(items.length, cursor + limit);
  const issues = [];
  for (let index = cursor; index < end; index += 1) issues.push(...await validateItem(db, plan, phase, items[index]));
  return { issues, nextCursor: end, processed: end - cursor, done: end >= items.length };
}

/** @param {any} db @param {any} plan @param {any} item */
async function applyTopic(db, plan, item) {
  const issues = await validateTopic(db, plan, item);
  if (issues.length) throw new ContentPackageError('Topic changed since validation.', issues);
  if (item.operation !== 'create') return;
  const appId = plan.resolved.topics.get(item.id);
  if (await rowById(db, concepts, appId)) return;
  const parentId = item.parentTopicId ? plan.resolved.topics.get(item.parentTopicId) : null;
  if (parentId && !(await rowById(db, concepts, parentId))) throw new ContentPackageError(`Topic ${item.id} cannot be written before its parent Topic.`);
  await db.insert(concepts).values({ id: appId, name: item.name, slug: item.slug, descriptionMd: item.descriptionMd, parentId, isActive: item.isActive });
}

/** @param {any} db @param {any} plan @param {any} item */
async function applyPrompt(db, plan, item) {
  const issues = await validatePrompt(db, plan, item);
  if (issues.length) throw new ContentPackageError('Question Prompt changed since validation.', issues);
  if (item.operation !== 'create') return;
  const id = plan.resolved.questionPrompts.get(item.id);
  if (!(await rowById(db, questionPrompts, id))) await db.insert(questionPrompts).values({ id, promptMd: item.promptMd, isActive: item.isActive });
}

/** @param {any} db @param {any} plan @param {any} item */
async function applyCase(db, plan, item) {
  const issues = await validateCase(db, plan, item);
  if (issues.length) throw new ContentPackageError('Case changed since validation.', issues);
  if (item.operation !== 'create') return;
  const id = plan.resolved.cases.get(item.id);
  if (!(await rowById(db, cases, id))) await db.insert(cases).values({ id, title: item.title, vignetteMd: item.vignetteMd, questionSelectionMode: item.questionSelectionMode, questionCount: item.questionCount, isActive: item.isActive });
}

/** @param {any} db @param {R2Bucket} bucket @param {any} plan @param {any} item */
async function applyAsset(db, bucket, plan, item) {
  const issues = await validateAsset(db, plan, item);
  if (issues.length) throw new ContentPackageError('Asset changed since validation.', issues);
  if (item.operation !== 'create') return;
  const id = plan.resolved.assets.get(item.id);
  if (await rowById(db, assets, id)) return;
  const key = deterministicStorageKey(plan.manifest.packageId, item.id, item.mimeType);
  if (await bucket.head(key)) {
    throw new ContentPackageError(`Asset ${item.id} has an orphaned deterministic R2 object without its expected D1 row; refusing to overwrite it.`);
  }
  const media = plan.parsed.media.get(item.path);
  if (!media) throw new ContentPackageError(`Asset ${item.id} media is missing from the staged package.`);
  await putTeachingImage(bucket, key, new Blob([media.bytes], { type: item.mimeType }));
  try {
    await db.insert(assets).values({ id, type: 'image', storageKey: key, mimeType: item.mimeType, originalFilename: item.originalFilename, altText: item.altText, sourceLabel: item.sourceLabel, sourceUrl: item.sourceUrl, licence: item.licence, isActive: item.isActive });
  } catch (error) {
    try { await deleteTeachingImage(bucket, key); }
    catch (cleanupError) { console.error('Unable to clean up imported teaching image after D1 failure.', { key, cleanupError }); }
    throw error;
  }
}

/** @param {any} db @param {any} plan @param {any} link */
async function applyCaseTopic(db, plan, link) {
  const issues = await validateCaseTopic(db, plan, link);
  if (issues.length) throw new ContentPackageError('Case Topic relationship changed since validation.', issues);
  if (link.caseItem.operation !== 'create') return;
  const caseId = plan.resolved.cases.get(link.caseId);
  const conceptId = plan.resolved.topics.get(link.topicId);
  const existing = (await db.select().from(caseConcepts).where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.conceptId, conceptId))).limit(1))[0] ?? null;
  if (existing) {
    if (existing.role !== link.role) throw new ContentPackageError(`Case ${link.caseId} already has Topic ${link.topicId} with a conflicting role.`);
    return;
  }
  await db.insert(caseConcepts).values({ caseId, conceptId, role: link.role });
}

/** @param {any} db @param {any} plan @param {any} item */
async function applyCaseAsset(db, plan, item) {
  const issues = await validateCaseAsset(db, plan, item);
  if (issues.length) throw new ContentPackageError('Case Asset relationship changed since validation.', issues);
  if (item.operation !== 'create') return;
  const caseId = plan.resolved.cases.get(item.caseId);
  const assetId = plan.resolved.assets.get(item.assetId);
  const existing = (await db.select().from(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId))).limit(1))[0] ?? null;
  if (!existing) await db.insert(caseAssets).values({ caseId, assetId, displayOrder: item.displayOrder, captionMd: item.captionMd });
}

/** @param {any} db @param {any} plan @param {any} item */
async function applyCaseQuestion(db, plan, item) {
  const issues = await validateCaseQuestion(db, plan, item);
  if (issues.length) throw new ContentPackageError('Case Question changed since validation.', issues);
  if (item.operation !== 'create') return;
  const id = plan.resolved.caseQuestions.get(item.id);
  if (!(await rowById(db, caseQuestions, id))) await db.insert(caseQuestions).values({ id, caseId: plan.resolved.cases.get(item.owner), questionPromptId: plan.resolved.questionPrompts.get(item.questionPromptId), answerMd: item.answerMd, isActive: item.isActive });
}

/** @param {any} db @param {any} plan @param {any} item */
async function applyTopicQuestion(db, plan, item) {
  const issues = await validateTopicQuestion(db, plan, item);
  if (issues.length) throw new ContentPackageError('Topic Question changed since validation.', issues);
  if (item.operation !== 'create') return;
  const id = plan.resolved.topicQuestions.get(item.id);
  if (!(await rowById(db, conceptQuestions, id))) await db.insert(conceptQuestions).values({ id, conceptId: plan.resolved.topics.get(item.owner), questionPromptId: plan.resolved.questionPrompts.get(item.questionPromptId), answerMd: item.answerMd, inheritToDescendants: item.inheritToDescendants, isActive: item.isActive });
}

/** @param {any} db @param {R2Bucket} bucket @param {any} plan @param {string} phase @param {number} cursor @param {number} [limit] */
export async function applyImportChunk(db, bucket, plan, phase, cursor, limit = IMPORT_ITEMS_PER_REQUEST) {
  if (!WRITE_PHASES.includes(phase)) throw new ContentPackageError(`Phase ${phase} is not an import phase.`);
  const items = itemsForPhase(plan, phase);
  const end = Math.min(items.length, cursor + limit);
  for (let index = cursor; index < end; index += 1) {
    const item = items[index];
    if (phase === 'import_topics') await applyTopic(db, plan, item);
    else if (phase === 'import_question_prompts') await applyPrompt(db, plan, item);
    else if (phase === 'import_cases') await applyCase(db, plan, item);
    else if (phase === 'import_assets') await applyAsset(db, bucket, plan, item);
    else if (phase === 'import_case_topics') await applyCaseTopic(db, plan, item);
    else if (phase === 'import_case_assets') await applyCaseAsset(db, plan, item);
    else if (phase === 'import_case_questions') await applyCaseQuestion(db, plan, item);
    else if (phase === 'import_topic_questions') await applyTopicQuestion(db, plan, item);
  }
  return { nextCursor: end, processed: end - cursor, done: end >= items.length };
}

/** @param {string} phase */
function nextPhase(phase) {
  const index = IMPORT_PHASES.indexOf(phase);
  if (index < 0 || index + 1 >= IMPORT_PHASES.length) return 'finalize';
  return IMPORT_PHASES[index + 1];
}

/** @param {D1Database} d1 @param {string} id */
export async function getImportJob(d1, id) {
  return await d1.prepare('SELECT * FROM import_jobs WHERE id = ?').bind(id).first();
}

/** @param {D1Database} d1 @param {number} [limit] */
export async function listImportJobs(d1, limit = 10) {
  const safeLimit = Math.max(1, Math.min(20, Number(limit) || 10));
  const result = await d1.prepare('SELECT * FROM import_jobs ORDER BY created_at DESC LIMIT ?').bind(safeLimit).all();
  return result.results ?? [];
}

/** @param {any} row */
export function serializeImportJob(row) {
  if (!row) return null;
  return {
    id: row.id,
    packageId: row.package_id,
    packageSha256: row.package_sha256,
    status: row.status,
    phase: row.phase,
    cursor: Number(row.cursor),
    processedCount: Number(row.processed_count),
    totalCount: Number(row.total_count),
    createdBy: row.created_by,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    completedAt: row.completed_at == null ? null : Number(row.completed_at),
    lastError: row.last_error ?? null
  };
}

/** @param {D1Result<unknown>} result */
function changed(result) {
  return Number(result?.meta?.changes ?? result?.changes ?? 0);
}

/**
 * Create the durable checkpoint before staging. If R2 staging fails, the failed
 * job remains visible with its error and no domain writes have occurred.
 * @param {D1Database} d1 @param {R2Bucket} bucket @param {Uint8Array} bytes @param {string} createdBy
 */
export async function createImportJob(d1, bucket, bytes, createdBy) {
  const parsed = await parseImportPackage(bytes);
  const plan = prepareResumableImportPlan(parsed);
  const digest = await importPackageDigest(bytes);
  const id = crypto.randomUUID();
  const now = Date.now();
  const storageKey = importPackageStorageKey(id);
  const total = importPlanTotalCount(plan);
  await d1.prepare(`INSERT INTO import_jobs (
    id, package_id, package_sha256, package_storage_key, status, phase, cursor,
    processed_count, total_count, created_by, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'validating', ?, 0, 0, ?, ?, ?, ?)`)
    .bind(id, plan.manifest.packageId, digest, storageKey, VALIDATION_PHASES[0], total, createdBy, now, now).run();
  try {
    await stageImportPackage(bucket, id, bytes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to stage import package.';
    await d1.prepare(`UPDATE import_jobs SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`).bind(message, Date.now(), id).run();
    throw error;
  }
  return serializeImportJob(await getImportJob(d1, id));
}

/** @param {D1Database} d1 @param {string} id */
async function claimJob(d1, id) {
  const existing = await getImportJob(d1, id);
  if (!existing) return { kind: 'missing', job: null };
  if (!RESUMABLE_STATUSES.has(existing.status)) return { kind: 'terminal', job: existing };
  const token = crypto.randomUUID();
  const now = Date.now();
  const result = await d1.prepare(`UPDATE import_jobs
    SET lease_token = ?, lease_expires_at = ?, updated_at = ?
    WHERE id = ?
      AND status IN ('validating', 'ready', 'importing', 'failed')
      AND (lease_expires_at IS NULL OR lease_expires_at < ?)`)
    .bind(token, now + IMPORT_LEASE_MS, now, id, now).run();
  if (!changed(result)) return { kind: 'busy', job: await getImportJob(d1, id) };
  return { kind: 'claimed', token, job: await getImportJob(d1, id) };
}

/** @param {D1Database} d1 @param {any} job @param {string} token @param {Record<string, any>} patch */
async function checkpoint(d1, job, token, patch) {
  const result = await d1.prepare(`UPDATE import_jobs SET
      status = ?, phase = ?, cursor = ?, processed_count = ?,
      updated_at = ?, completed_at = ?, last_error = ?,
      lease_token = NULL, lease_expires_at = NULL
    WHERE id = ? AND lease_token = ? AND phase = ? AND cursor = ?`)
    .bind(
      patch.status, patch.phase, patch.cursor, patch.processedCount,
      Date.now(), patch.completedAt ?? null, patch.lastError ?? null,
      job.id, token, job.phase, job.cursor
    ).run();
  if (!changed(result)) throw new ContentPackageError('Import checkpoint changed concurrently; no cursor advance was recorded.');
}

/**
 * Perform exactly one bounded validation/write step. The package and plan are
 * always re-derived server-side from the immutable staged ZIP; client phase,
 * cursor, IDs, storage keys and write plans are never trusted.
 * @param {D1Database} d1 @param {R2Bucket} bucket @param {string} id
 */
export async function processNextImportChunk(d1, bucket, id) {
  const claim = await claimJob(d1, id);
  if (claim.kind === 'missing') throw new ContentPackageError('Import job was not found.');
  if (claim.kind === 'busy') return { busy: true, job: serializeImportJob(claim.job) };
  if (claim.kind === 'terminal') return { busy: false, job: serializeImportJob(claim.job) };

  const { token, job } = claim;
  try {
    // Finalization deliberately does not re-read the staged ZIP. If an HTTP
    // request dies after R2 deletion but before the D1 checkpoint, retrying the
    // finalize cursor safely repeats the idempotent delete and can still mark
    // the job complete.
    if (job.phase === 'finalize') {
      await deleteStagedImportPackage(bucket, id);
      await checkpoint(d1, job, token, { status: 'complete', phase: 'finalize', cursor: 0, processedCount: Number(job.total_count), completedAt: Date.now() });
      return { busy: false, job: serializeImportJob(await getImportJob(d1, id)) };
    }

    const bytes = await readStagedImportPackage(bucket, id);
    const digest = await importPackageDigest(bytes);
    if (digest !== job.package_sha256) throw new ContentPackageError('The staged package SHA-256 no longer matches the import job.');
    if (job.package_storage_key !== importPackageStorageKey(id)) throw new ContentPackageError('The import job has an unexpected staging key.');
    const parsed = await parseImportPackage(bytes);
    const plan = prepareResumableImportPlan(parsed);
    if (plan.manifest.packageId !== job.package_id) throw new ContentPackageError('The staged package ID no longer matches the import job.');
    const db = createDb(d1);

    if (job.status === 'ready') {
      const phase = WRITE_PHASES[0];
      const result = await applyImportChunk(db, bucket, plan, phase, 0);
      const next = result.done ? nextPhase(phase) : phase;
      await checkpoint(d1, job, token, { status: 'importing', phase: next, cursor: result.done ? 0 : result.nextCursor, processedCount: Number(job.processed_count) + result.processed });
      return { busy: false, job: serializeImportJob(await getImportJob(d1, id)) };
    }

    if (VALIDATION_PHASES.includes(job.phase)) {
      const result = await validateImportChunk(db, plan, job.phase, Number(job.cursor));
      if (result.issues.length) throw new ContentPackageError('The package failed database validation.', result.issues);
      const next = result.done ? nextPhase(job.phase) : job.phase;
      const validationFinished = result.done && job.phase === VALIDATION_PHASES[VALIDATION_PHASES.length - 1];
      await checkpoint(d1, job, token, {
        status: validationFinished ? 'ready' : 'validating',
        phase: validationFinished ? WRITE_PHASES[0] : next,
        cursor: result.done ? 0 : result.nextCursor,
        processedCount: Number(job.processed_count) + result.processed
      });
      return { busy: false, job: serializeImportJob(await getImportJob(d1, id)) };
    }

    if (WRITE_PHASES.includes(job.phase)) {
      const result = await applyImportChunk(db, bucket, plan, job.phase, Number(job.cursor));
      const next = result.done ? nextPhase(job.phase) : job.phase;
      await checkpoint(d1, job, token, {
        status: 'importing', phase: next, cursor: result.done ? 0 : result.nextCursor,
        processedCount: Number(job.processed_count) + result.processed
      });
      return { busy: false, job: serializeImportJob(await getImportJob(d1, id)) };
    }

    throw new ContentPackageError(`Import job has unknown phase ${job.phase}.`);
  } catch (error) {
    const message = error instanceof ContentPackageError ? error.issues.join(' ') : error instanceof Error ? error.message : 'Import processing failed.';
    await d1.prepare(`UPDATE import_jobs SET status = 'failed', last_error = ?, updated_at = ?, lease_token = NULL, lease_expires_at = NULL WHERE id = ? AND lease_token = ?`).bind(message, Date.now(), id, token).run();
    throw error;
  }
}

/** @param {D1Database} d1 @param {R2Bucket} bucket @param {string} id */
export async function cancelImportJob(d1, bucket, id) {
  const job = await getImportJob(d1, id);
  if (!job) throw new ContentPackageError('Import job was not found.');
  if (job.status === 'complete') throw new ContentPackageError('A completed import cannot be cancelled.');
  if (job.status === 'cancelled') return serializeImportJob(job);
  const now = Date.now();
  const result = await d1.prepare(`UPDATE import_jobs
    SET status = 'cancelled', updated_at = ?, completed_at = ?, lease_token = NULL, lease_expires_at = NULL
    WHERE id = ? AND status <> 'complete' AND (lease_expires_at IS NULL OR lease_expires_at < ?)`)
    .bind(now, now, id, now).run();
  if (!changed(result)) throw new ContentPackageError('This import is currently processing in another request. Pause processing and retry cancellation.');
  try { await deleteStagedImportPackage(bucket, id); }
  catch (error) { console.error('Unable to remove cancelled import staging package.', { id, error }); }
  return serializeImportJob(await getImportJob(d1, id));
}

/**
 * Static preview: hardened ZIP parsing plus package-only invariants. Database
 * conflict validation is intentionally performed later in bounded persisted
 * job phases before any domain writes begin.
 * @param {Uint8Array} bytes
 */
export async function previewResumableImport(bytes) {
  const parsed = await parseImportPackage(bytes);
  const plan = prepareResumableImportPlan(parsed);
  return { packageId: plan.manifest.packageId, preview: plan.preview, warnings: plan.warnings };
}
