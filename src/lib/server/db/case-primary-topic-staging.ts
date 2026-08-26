import { and, eq, inArray, isNull } from 'drizzle-orm';

import {
  AdminContentInputError,
  bulkPromoteCaseTopics
} from './admin-content.js';
import { caseConcepts, cases } from './schema.js';

export type StagedCasePrimaryTopicChange = {
  caseId: unknown;
  conceptId: unknown;
  expectedConceptId: unknown;
};

type NormalizedStagedCasePrimaryTopicChange = {
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

  if (new Set(normalized.map((change) => change.conceptId)).size !== 1) {
    throw new AdminContentInputError('Apply or discard the current Primary Topic batch before staging Cases to a different Topic.');
  }

  return normalized;
}

export async function applyStagedCasePrimaryTopics(
  db: import('./index.js').LearningDb,
  changes: StagedCasePrimaryTopicChange[]
) {
  const normalized = normalizeChanges(changes);
  const caseIds = normalized.map((change) => change.caseId);
  const currentRows = await db
    .select({ caseId: caseConcepts.caseId, conceptId: caseConcepts.conceptId })
    .from(caseConcepts)
    .innerJoin(cases, eq(cases.id, caseConcepts.caseId))
    .where(and(
      inArray(caseConcepts.caseId, caseIds),
      eq(caseConcepts.role, 'primary'),
      eq(cases.isActive, true),
      isNull(cases.previewSessionId)
    ));

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

  await bulkPromoteCaseTopics(db, {
    caseIds,
    conceptId: normalized[0].conceptId
  });
}
