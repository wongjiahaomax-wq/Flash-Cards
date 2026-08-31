import { and, asc, eq } from 'drizzle-orm';

import { studySelectionRoutes, studySelections } from './schema.js';
import type { SystemStudySelectionRoute } from '../learning/system-study-routes.ts';

export type StudySelectionSnapshot = {
  id: string;
  userId: string;
  systemId: string;
  routes: SystemStudySelectionRoute[];
};

export function buildStudySelectionCreationWrites(
  db: import('./index.js').LearningDb,
  input: { id: string; userId: string; systemId: string; routes: readonly SystemStudySelectionRoute[] }
) {
  if (input.routes.length === 0) throw new Error('A study selection requires at least one route.');
  return [
    db.insert(studySelections).values({
      id: input.id,
      userId: input.userId,
      systemConceptId: input.systemId
    }),
    db.insert(studySelectionRoutes).values(input.routes.map((route) => ({
      studySelectionId: input.id,
      routeType: route.routeType,
      routeId: route.routeId
    })))
  ] as const;
}

export async function readStudySelection(
  db: import('./index.js').LearningDb,
  input: { selectionId: string; userId: string }
): Promise<StudySelectionSnapshot | null> {
  const selectionRows = await db
    .select({
      id: studySelections.id,
      userId: studySelections.userId,
      systemId: studySelections.systemConceptId
    })
    .from(studySelections)
    .where(and(eq(studySelections.id, input.selectionId), eq(studySelections.userId, input.userId)))
    .limit(1);
  const selection = selectionRows[0];
  if (!selection) return null;

  const routes = await db
    .select({ routeType: studySelectionRoutes.routeType, routeId: studySelectionRoutes.routeId })
    .from(studySelectionRoutes)
    .where(eq(studySelectionRoutes.studySelectionId, input.selectionId))
    .orderBy(asc(studySelectionRoutes.routeType), asc(studySelectionRoutes.routeId));

  return { ...selection, routes };
}
