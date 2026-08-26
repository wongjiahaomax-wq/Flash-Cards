import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  AdminContentInputError,
  bulkPromoteCaseTopics
} from './admin-content.js';
import { taxonomyConcepts } from './contextual-schema.ts';
import { caseConcepts, cases } from './schema.js';

export type StagedCasePrimaryTopicChange = {
  caseId: unknown;
  conceptId: unknown;
  expectedConceptId: unknown;
};

export type NormalizedStagedCasePrimaryTopicChange = {
  caseId: string;
  conceptId: string;
  expectedConceptId: string;
};

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new AdminContentInputError(`${label} is required.`);
  return text;
}

function hasExpectedConcept(change: unknown): change is StagedCasePrimaryTopicChange {
  return Boolean(change && typeof change === 'object' && Object.prototype.hasOwnProperty.call(change, 'expectedConceptId'));
}

function normalizeChanges(changes: StagedCasePrimaryTopicChange[]): NormalizedStagedCasePrimaryTopicChange[] {
  if (!Array.isArray(changes) || changes.length < 1 || changes.length > 60) {
    throw new AdminContentInputError('Staged Primary Topic updates must contain between 1 and 60 Cases.');
  }

  const normalized = changes.map((change) => {
    if (!hasExpectedConcept(change)) {
      throw new AdminContentInputError('Every staged Case change must include its loaded Primary Topic for stale-state validation.');
    }
    return {
      caseId: requiredText(change.caseId, 'Case'),
      conceptId: requiredText(change.conceptId, 'Primary Topic'),
      expectedConceptId: requiredText(change.expectedConceptId, 'Loaded Primary Topic')
    };
  });

  if (new Set(normalized.map((change) => change.caseId)).size !== normalized.length) {
    throw new AdminContentInputError('Each Case may appear only once in a staged Primary Topic update.');
  }

  return normalized;
}

export async function validateStagedCasePrimaryTopics(
  db: import('./index.js').LearningDb,
  changes: StagedCasePrimaryTopicChange[]
) {
  const normalized = normalizeChanges(changes);
  const caseIds = normalized.map((change) => change.caseId);
  const targetTopicIds = [...new Set(normalized.map((change) => change.conceptId))];

  const [currentRows, targetRows] = await Promise.all([
    db
      .select({ caseId: caseConcepts.caseId, conceptId: caseConcepts.conceptId })
      .from(caseConcepts)
      .innerJoin(cases, eq(cases.id, caseConcepts.caseId))
      .where(and(
        inArray(caseConcepts.caseId, caseIds),
        eq(caseConcepts.role, 'primary'),
        eq(cases.isActive, true),
        isNull(cases.previewSessionId)
      )),
    db
      .select({ id: taxonomyConcepts.id })
      .from(taxonomyConcepts)
      .where(and(
        inArray(taxonomyConcepts.id, targetTopicIds),
        eq(taxonomyConcepts.kind, 'topic'),
        eq(taxonomyConcepts.isActive, true)
      ))
  ]);

  const activeTargetIds = new Set(targetRows.map((row) => row.id));
  if (targetTopicIds.some((topicId) => !activeTargetIds.has(topicId))) {
    throw new AdminContentInputError('The selected Primary Topic is missing or inactive.');
  }

  const currentByCaseId = new Map<string, string[]>();
  for (const row of currentRows) {
    const topics = currentByCaseId.get(row.caseId) ?? [];
    topics.push(row.conceptId);
    currentByCaseId.set(row.caseId, topics);
  }

  for (const change of normalized) {
    const currentTopics = currentByCaseId.get(change.caseId) ?? [];
    if (currentTopics.length !== 1 || currentTopics[0] !== change.expectedConceptId) {
      throw new AdminContentInputError(
        'Case classification changed since this workspace was loaded. Refresh and review the staged Primary Topic changes.'
      );
    }
  }

  return normalized;
}

export async function applyValidatedCasePrimaryTopics(
  db: import('./index.js').LearningDb,
  changes: NormalizedStagedCasePrimaryTopicChange[]
) {
  const caseIdsByTopic = new Map<string, string[]>();
  for (const change of changes) {
    const caseIds = caseIdsByTopic.get(change.conceptId) ?? [];
    caseIds.push(change.caseId);
    caseIdsByTopic.set(change.conceptId, caseIds);
  }

  for (const [conceptId, caseIds] of caseIdsByTopic) {
    await bulkPromoteCaseTopics(db, { caseIds, conceptId });
  }
}

export async function applyStagedCasePrimaryTopics(
  db: import('./index.js').LearningDb,
  changes: StagedCasePrimaryTopicChange[]
) {
  const normalized = await validateStagedCasePrimaryTopics(db, changes);
  await applyValidatedCasePrimaryTopics(db, normalized);
}
