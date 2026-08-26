import { and, asc, eq, isNull } from 'drizzle-orm';

import { systemAncestorId } from '../learning/taxonomy-graph.ts';
import { listConceptTaxonomy } from './concept-taxonomy-compat.ts';
import { caseConcepts, cases, concepts } from './schema.js';
import { caseTags, tags } from './tag-schema.js';

type LearningDb = import('./index.js').LearningDb;
type LifecycleCaseRow = {
  id: string;
  title: string;
  vignetteMd: string | null;
  isActive: boolean;
};

export const CASE_LIFECYCLE_BULK_LIMIT = 60;

export class CaseLifecycleError extends Error {
  code: string;

  constructor(message: string, code = 'CASE_LIFECYCLE_INVALID') {
    super(message);
    this.name = 'CaseLifecycleError';
    this.code = code;
  }
}

function requiredCaseId(value: unknown): string {
  const caseId = String(value ?? '').trim();
  if (!caseId) throw new CaseLifecycleError('A Case is required.', 'CASE_REQUIRED');
  return caseId;
}

function selectedCaseIds(values: unknown[]): string[] {
  const caseIds = [...new Set(values.map(requiredCaseId))];
  if (!caseIds.length) throw new CaseLifecycleError('Select at least one Case.', 'CASE_REQUIRED');
  if (caseIds.length > CASE_LIFECYCLE_BULK_LIMIT) {
    throw new CaseLifecycleError(`Select no more than ${CASE_LIFECYCLE_BULK_LIMIT} Cases at a time.`, 'CASE_BULK_LIMIT');
  }
  return caseIds;
}

async function loadProductionCase(db: LearningDb, caseId: string): Promise<LifecycleCaseRow | null> {
  const rows = await db
    .select({
      id: cases.id,
      title: cases.title,
      vignetteMd: cases.vignetteMd,
      isActive: cases.isActive
    })
    .from(cases)
    .where(and(eq(cases.id, caseId), isNull(cases.previewSessionId)))
    .limit(1);
  return rows[0] ?? null;
}

async function requireProductionLifecycleCase(db: LearningDb, caseIdValue: unknown): Promise<LifecycleCaseRow> {
  const caseId = requiredCaseId(caseIdValue);
  const row = await loadProductionCase(db, caseId);
  if (!row) {
    throw new CaseLifecycleError('The selected Case is missing or is not a Production Case.', 'PRODUCTION_CASE_REQUIRED');
  }
  return row;
}

async function validateRestorableCase(db: LearningDb, current: LifecycleCaseRow, requireInactive: boolean) {
  if (requireInactive && current.isActive) {
    throw new CaseLifecycleError(`“${current.title}” is already active and cannot be included in an inactive Case restore.`, 'CASE_STATE_MISMATCH');
  }
  if (current.isActive) return;

  const primaryRows = await db
    .select({
      conceptId: caseConcepts.conceptId,
      conceptName: concepts.name,
      conceptKind: concepts.kind,
      conceptIsActive: concepts.isActive
    })
    .from(caseConcepts)
    .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(eq(caseConcepts.caseId, current.id), eq(caseConcepts.role, 'primary')))
    .orderBy(asc(caseConcepts.conceptId));

  if (primaryRows.length !== 1) {
    throw new CaseLifecycleError('Cannot restore this Case because it must have exactly one Primary Topic.', 'RESTORE_PRIMARY_TOPIC_COUNT');
  }

  const primary = primaryRows[0];
  if (!primary.conceptName || !primary.conceptKind) {
    throw new CaseLifecycleError('Cannot restore this Case because its Primary Topic no longer exists.', 'RESTORE_PRIMARY_TOPIC_MISSING');
  }
  if (primary.conceptKind !== 'topic') {
    throw new CaseLifecycleError('Cannot restore this Case because its Primary Topic is classified as a System.', 'RESTORE_PRIMARY_TOPIC_KIND');
  }
  if (!primary.conceptIsActive) {
    throw new CaseLifecycleError('Cannot restore this Case because its Primary Topic is inactive.', 'RESTORE_PRIMARY_TOPIC_INACTIVE');
  }
}

async function runLifecycleBatch(db: LearningDb, writes: any[]) {
  if (typeof db.batch !== 'function') {
    throw new CaseLifecycleError('Bulk Case lifecycle updates require database batch support; no Cases were changed.', 'CASE_BULK_UNAVAILABLE');
  }
  try {
    await db.batch(writes as [any, ...any[]]);
  } catch (error) {
    if (error instanceof TypeError && /batch is not a function/i.test(error.message)) {
      throw new CaseLifecycleError('Bulk Case lifecycle updates require database batch support; no Cases were changed.', 'CASE_BULK_UNAVAILABLE');
    }
    throw error;
  }
}

export async function deactivateProductionCase(db: LearningDb, caseIdValue: unknown) {
  const current = await requireProductionLifecycleCase(db, caseIdValue);
  if (!current.isActive) return { ...current, changed: false };

  await db
    .update(cases)
    .set({ isActive: false })
    .where(and(eq(cases.id, current.id), eq(cases.isActive, true), isNull(cases.previewSessionId)));
  return { ...current, isActive: false, changed: true };
}

export async function restoreProductionCase(db: LearningDb, caseIdValue: unknown) {
  const current = await requireProductionLifecycleCase(db, caseIdValue);
  if (current.isActive) return { ...current, changed: false };

  await validateRestorableCase(db, current, false);
  await db
    .update(cases)
    .set({ isActive: true })
    .where(and(eq(cases.id, current.id), eq(cases.isActive, false), isNull(cases.previewSessionId)));
  return { ...current, isActive: true, changed: true };
}

export async function bulkDeactivateProductionCases(db: LearningDb, values: unknown[]) {
  const caseIds = selectedCaseIds(values);
  const rows = await Promise.all(caseIds.map((caseId) => requireProductionLifecycleCase(db, caseId)));
  const inactive = rows.find((row) => !row.isActive);
  if (inactive) {
    throw new CaseLifecycleError(`“${inactive.title}” is already inactive. Bulk deactivation accepts active Production Cases only.`, 'CASE_STATE_MISMATCH');
  }

  const writes = rows.map((row) => db
    .update(cases)
    .set({ isActive: false })
    .where(and(eq(cases.id, row.id), eq(cases.isActive, true), isNull(cases.previewSessionId))));
  await runLifecycleBatch(db, writes);
  return { count: rows.length };
}

export async function bulkRestoreProductionCases(db: LearningDb, values: unknown[]) {
  const caseIds = selectedCaseIds(values);
  const rows = await Promise.all(caseIds.map((caseId) => requireProductionLifecycleCase(db, caseId)));
  for (const row of rows) await validateRestorableCase(db, row, true);

  const writes = rows.map((row) => db
    .update(cases)
    .set({ isActive: true })
    .where(and(eq(cases.id, row.id), eq(cases.isActive, false), isNull(cases.previewSessionId))));
  await runLifecycleBatch(db, writes);
  return { count: rows.length };
}

export async function getInactiveProductionCaseRecovery(db: LearningDb, caseIdValue: unknown) {
  const caseId = requiredCaseId(caseIdValue);
  const current = await loadProductionCase(db, caseId);
  if (!current || current.isActive) return null;

  const [primaryRows, tagRows, taxonomyRows] = await Promise.all([
    db
      .select({
        conceptId: caseConcepts.conceptId,
        name: concepts.name,
        kind: concepts.kind,
        isActive: concepts.isActive
      })
      .from(caseConcepts)
      .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
      .where(and(eq(caseConcepts.caseId, caseId), eq(caseConcepts.role, 'primary')))
      .orderBy(asc(caseConcepts.conceptId)),
    db
      .select({ id: tags.id, name: tags.name, isActive: tags.isActive })
      .from(caseTags)
      .innerJoin(tags, eq(tags.id, caseTags.tagId))
      .where(eq(caseTags.caseId, caseId))
      .orderBy(asc(tags.name), asc(tags.id)),
    listConceptTaxonomy(db)
  ]);

  const primaryConceptId = primaryRows.length === 1 ? primaryRows[0].conceptId : null;
  const systemId = primaryConceptId ? systemAncestorId(primaryConceptId, taxonomyRows) : null;
  const systemName = systemId ? taxonomyRows.find((concept) => concept.id === systemId)?.name ?? null : null;

  return {
    case: current,
    primaryTopics: primaryRows,
    systemName,
    tags: tagRows
  };
}
