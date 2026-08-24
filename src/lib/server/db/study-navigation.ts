import { and, asc, eq, isNull } from 'drizzle-orm';

import { caseConcepts, cases, concepts } from './schema.js';
import { caseTags, systemTags, tags } from './tag-schema.js';
import {
  buildSystemStudyNavigation,
  resolveSystemStudyCandidates,
  routeBelongsToSystem,
  type SystemRouteType
} from '../learning/system-study-routes.ts';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export class StudyNavigationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StudyNavigationInputError';
  }
}

/** @param {import('./index.js').LearningDb} db */
export async function loadStudyNavigationSnapshot(db: import('./index.js').LearningDb) {
  const [conceptRows, caseTopicRows, caseTagRows, systemTagRows] = await Promise.all([
    db
      .select({
        id: concepts.id,
        name: concepts.name,
        kind: concepts.kind,
        parentId: concepts.parentId,
        isActive: concepts.isActive
      })
      .from(concepts)
      .where(eq(concepts.isActive, true))
      .orderBy(asc(concepts.name), asc(concepts.id)),
    db
      .select({
        id: cases.id,
        title: cases.title,
        vignetteMd: cases.vignetteMd,
        isActive: cases.isActive,
        conceptId: caseConcepts.conceptId,
        role: caseConcepts.role
      })
      .from(cases)
      .innerJoin(caseConcepts, eq(caseConcepts.caseId, cases.id))
      .where(and(eq(cases.isActive, true), isNull(cases.previewSessionId))),
    db
      .select({
        caseId: caseTags.caseId,
        tagId: caseTags.tagId,
        tagName: tags.name
      })
      .from(caseTags)
      .innerJoin(tags, eq(tags.id, caseTags.tagId))
      .innerJoin(cases, eq(cases.id, caseTags.caseId))
      .where(and(eq(tags.isActive, true), eq(cases.isActive, true), isNull(cases.previewSessionId))),
    db
      .select({
        systemConceptId: systemTags.systemConceptId,
        tagId: systemTags.tagId,
        tagName: tags.name,
        displayOrder: systemTags.displayOrder
      })
      .from(systemTags)
      .innerJoin(tags, eq(tags.id, systemTags.tagId))
      .innerJoin(concepts, eq(concepts.id, systemTags.systemConceptId))
      .where(and(eq(concepts.kind, 'system'), eq(concepts.isActive, true), eq(tags.isActive, true)))
      .orderBy(asc(systemTags.displayOrder), asc(tags.name), asc(tags.id))
  ]);

  return { concepts: conceptRows, caseTopicRows, caseTagRows, systemTagRows };
}

export async function listStudySystems(db: import('./index.js').LearningDb) {
  return buildSystemStudyNavigation(await loadStudyNavigationSnapshot(db));
}

export async function listSystemEligibleCases(
  db: import('./index.js').LearningDb,
  input: { systemId: string; routeType: SystemRouteType; routeId?: string | null }
) {
  const systemId = String(input.systemId ?? '').trim();
  if (!systemId) throw new StudyNavigationInputError('A study System is required.');
  if (!['all', 'topic', 'tag'].includes(input.routeType)) {
    throw new StudyNavigationInputError('Choose All, a Topic, or a Tag route.');
  }
  const routeId = input.routeType === 'all' ? null : String(input.routeId ?? '').trim();
  if (input.routeType !== 'all' && !routeId) {
    throw new StudyNavigationInputError('Choose a Topic or Tag within this System.');
  }

  const snapshot = await loadStudyNavigationSnapshot(db);
  const system = snapshot.concepts.find((concept) => concept.id === systemId && concept.kind === 'system');
  if (!system) throw new StudyNavigationInputError('The selected System is missing or inactive.');
  if (routeId && !routeBelongsToSystem(systemId, input.routeType as 'topic' | 'tag', routeId, snapshot)) {
    throw new StudyNavigationInputError('The selected Topic or Tag is not available in this System.');
  }

  return resolveSystemStudyCandidates({
    ...snapshot,
    systemId,
    routeType: input.routeType,
    routeId
  });
}
