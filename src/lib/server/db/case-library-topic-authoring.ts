import { and, eq, inArray } from 'drizzle-orm';

import { listConceptTaxonomy } from './concept-taxonomy-compat.ts';
import { ContentGuardError, requireProductionCase } from './content-guards.js';
import { caseConcepts, concepts } from './schema.js';
import {
  buildTaxonomyConceptCreationWrite,
  prepareTaxonomyConceptCreation,
  taxonomyConceptCreationError
} from './taxonomy-admin-write.ts';

export class CaseLibraryTopicInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CaseLibraryTopicInputError';
  }
}

function requiredText(value: unknown, label: string) {
  const text = String(value ?? '').trim();
  if (!text) throw new CaseLibraryTopicInputError(`${label} is required.`);
  return text;
}

function concurrentClassificationError() {
  return new CaseLibraryTopicInputError(
    'One or more selected Cases changed Primary Topic while this Topic was being assigned. No partial assignment was kept. Review the current Case classifications and try again.'
  );
}

async function requireActiveProductionCase(db: import('./index.js').LearningDb, caseId: string) {
  try {
    return await requireProductionCase(db, caseId);
  } catch (error) {
    if (error instanceof ContentGuardError) throw new CaseLibraryTopicInputError('The selected Case is missing or inactive.');
    throw error;
  }
}

async function validateSelectedCases(db: import('./index.js').LearningDb, caseIds: string[]) {
  if (!caseIds.length) return [];
  const conceptRows = await listConceptTaxonomy(db);
  const topicIds = new Set(conceptRows.filter((concept) => concept.kind === 'topic').map((concept) => concept.id));
  const validated = [];

  for (const caseId of caseIds) {
    await requireActiveProductionCase(db, caseId);
    const relationships = await db
      .select({ conceptId: caseConcepts.conceptId, role: caseConcepts.role })
      .from(caseConcepts)
      .where(eq(caseConcepts.caseId, caseId));
    const primaryRows = relationships.filter((relationship) => relationship.role === 'primary' && topicIds.has(relationship.conceptId));
    if (primaryRows.length !== 1) {
      throw new CaseLibraryTopicInputError('Each selected active Case must have exactly one primary Topic before it can be reassigned.');
    }
    validated.push({ caseId, primaryConceptId: primaryRows[0].conceptId });
  }
  return validated;
}

async function loadSelectedPrimaryRows(db: import('./index.js').LearningDb, caseIds: string[]) {
  if (!caseIds.length) return [];
  return db
    .select({ caseId: caseConcepts.caseId, conceptId: caseConcepts.conceptId })
    .from(caseConcepts)
    .where(and(
      inArray(caseConcepts.caseId, caseIds),
      eq(caseConcepts.role, 'primary')
    ));
}

async function verifyCreatedTopicAssignments(
  db: import('./index.js').LearningDb,
  validatedCases: { caseId: string; primaryConceptId: string }[],
  conceptId: string
) {
  if (!validatedCases.length) return;
  const rows = await loadSelectedPrimaryRows(db, validatedCases.map((current) => current.caseId));
  const primaryByCase = new Map<string, string[]>();
  for (const row of rows) {
    const current = primaryByCase.get(row.caseId) ?? [];
    current.push(row.conceptId);
    primaryByCase.set(row.caseId, current);
  }
  const allAssigned = validatedCases.every((current) => {
    const primaryIds = primaryByCase.get(current.caseId) ?? [];
    return primaryIds.length === 1 && primaryIds[0] === conceptId;
  });
  if (!allAssigned) throw concurrentClassificationError();
}

async function compensateCreatedTopicAssignment(
  db: import('./index.js').LearningDb,
  validatedCases: { caseId: string; primaryConceptId: string }[],
  conceptId: string
) {
  const rows = await loadSelectedPrimaryRows(db, validatedCases.map((current) => current.caseId));
  const assignedCaseIds = new Set(rows.filter((row) => row.conceptId === conceptId).map((row) => row.caseId));
  const rollbackWrites = validatedCases
    .filter((current) => assignedCaseIds.has(current.caseId))
    .map((current) => db
      .update(caseConcepts)
      .set({ conceptId: current.primaryConceptId, role: 'primary' })
      .where(and(
        eq(caseConcepts.caseId, current.caseId),
        eq(caseConcepts.conceptId, conceptId),
        eq(caseConcepts.role, 'primary')
      )));
  const conceptDelete = db.delete(concepts).where(eq(concepts.id, conceptId));

  if (typeof db.batch === 'function') {
    const compensationWrites = [...rollbackWrites, conceptDelete] as [any, ...any[]];
    await db.batch(compensationWrites);
    return;
  }
  for (const rollbackWrite of rollbackWrites) await rollbackWrite;
  await conceptDelete;
}

/**
 * Create one global Topic from the Production Admin Case Library and optionally
 * make it the canonical Primary Topic for the selected active Production Cases.
 * D1 uses one batch after validation. After the writes, the selected Primary
 * relationships are verified so a concurrent classification change cannot be
 * reported as successful partial assignment. Any detected partial state is
 * compensated before the error is returned.
 */
export async function createCaseLibraryTopic(
  db: import('./index.js').LearningDb,
  input: { caseIds?: unknown[]; name: unknown; parentId?: unknown }
) {
  const caseIds = [...new Set((input.caseIds ?? []).map((caseId) => requiredText(caseId, 'Case')))];
  if (caseIds.length > 60) throw new CaseLibraryTopicInputError('Select no more than 60 Cases at a time.');

  const validatedCases = await validateSelectedCases(db, caseIds);
  const concept = await prepareTaxonomyConceptCreation(db, {
    name: input.name,
    kind: 'topic',
    parentId: input.parentId
  });
  const conceptWrite = buildTaxonomyConceptCreationWrite(db, concept);
  const relationshipWrites = validatedCases.map((current) => db
    .update(caseConcepts)
    .set({ conceptId: concept.id, role: 'primary' })
    .where(and(
      eq(caseConcepts.caseId, current.caseId),
      eq(caseConcepts.conceptId, current.primaryConceptId),
      eq(caseConcepts.role, 'primary')
    )));

  if (typeof db.batch === 'function') {
    try {
      await db.batch(/** @type {[any, ...any[]]} */ ([conceptWrite, ...relationshipWrites]));
    } catch (error) {
      throw taxonomyConceptCreationError(error);
    }
    try {
      await verifyCreatedTopicAssignments(db, validatedCases, concept.id);
    } catch (error) {
      try {
        await compensateCreatedTopicAssignment(db, validatedCases, concept.id);
      } catch (cleanupError) {
        console.error('Unable to compensate a failed Case Library create-and-assign operation.', cleanupError);
        throw cleanupError;
      }
      throw taxonomyConceptCreationError(error);
    }
    return { ...concept, selectedCount: validatedCases.length };
  }

  let conceptCreated = false;
  try {
    await conceptWrite;
    conceptCreated = true;
    for (const relationshipWrite of relationshipWrites) await relationshipWrite;
    await verifyCreatedTopicAssignments(db, validatedCases, concept.id);
  } catch (error) {
    if (conceptCreated) {
      try {
        await compensateCreatedTopicAssignment(db, validatedCases, concept.id);
      } catch (cleanupError) {
        console.error('Unable to compensate a failed Case Library create-and-assign operation.', cleanupError);
        throw cleanupError;
      }
    }
    throw taxonomyConceptCreationError(error);
  }

  return { ...concept, selectedCount: validatedCases.length };
}
