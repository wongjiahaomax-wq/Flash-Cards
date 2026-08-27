import { and, eq } from 'drizzle-orm';

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

/**
 * Create one global Topic from the Production Admin Case Library and optionally
 * make it the canonical Primary Topic for the selected active Production Cases.
 * D1 uses one batch after validation. The non-batch abstraction used by tests
 * compensates already-applied relationship writes and then removes the Topic.
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
    return { ...concept, selectedCount: validatedCases.length };
  }

  const updatedCases: typeof validatedCases = [];
  let conceptCreated = false;
  try {
    await conceptWrite;
    conceptCreated = true;
    for (let index = 0; index < relationshipWrites.length; index += 1) {
      await relationshipWrites[index];
      updatedCases.push(validatedCases[index]);
    }
  } catch (error) {
    for (const current of [...updatedCases].reverse()) {
      try {
        await db
          .update(caseConcepts)
          .set({ conceptId: current.primaryConceptId, role: 'primary' })
          .where(and(
            eq(caseConcepts.caseId, current.caseId),
            eq(caseConcepts.conceptId, concept.id),
            eq(caseConcepts.role, 'primary')
          ));
      } catch (cleanupError) {
        console.error('Unable to restore a Primary Topic after failed Case Library Topic creation.', cleanupError);
      }
    }
    if (conceptCreated) {
      try {
        await db.delete(concepts).where(eq(concepts.id, concept.id));
      } catch (cleanupError) {
        console.error('Unable to clean up a Topic after failed Case Library Topic creation.', cleanupError);
      }
    }
    throw taxonomyConceptCreationError(error);
  }

  return { ...concept, selectedCount: validatedCases.length };
}
