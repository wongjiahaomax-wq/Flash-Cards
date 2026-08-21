import { and, asc, eq, inArray, isNull, like, sql } from 'drizzle-orm';

import { caseConcepts, cases, concepts } from './schema.js';
import { caseTags, tags } from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */

export const CASE_LIBRARY_PAGE_SIZE = 60;

/**
 * @param {URLSearchParams | { get(name: string): string | null }} params
 * @returns {{ search: string, tagId: string }}
 */
export function parseCaseLibraryFilters(params) {
  return {
    search: params.get('q')?.trim() ?? '',
    tagId: params.get('tag')?.trim() ?? ''
  };
}

/** @param {URLSearchParams | { get(name: string): string | null }} params */
export function parseCaseLibraryPage(params) {
  const raw = Number(params.get('page') ?? 1);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 1;
}

/** @param {{ search: string, tagId: string }} filters */
function caseLibraryConditions(filters) {
  const conditions = [eq(cases.isActive, true), isNull(cases.previewSessionId)];
  if (filters.search) conditions.push(like(cases.title, `%${filters.search}%`));
  if (filters.tagId) {
    conditions.push(sql`exists (
      select 1
      from case_tags filter_case_tags
      join tags filter_tags on filter_tags.id = filter_case_tags.tag_id
      where filter_case_tags.case_id = ${cases.id}
        and filter_case_tags.tag_id = ${filters.tagId}
        and filter_tags.is_active = true
    )`);
  }
  return conditions;
}

/** @param {LearningDb} db @param {string[]} caseIds */
async function listPageCaseTags(db, caseIds) {
  if (!caseIds.length) return [];
  return db
    .select({ caseId: caseTags.caseId, tagId: caseTags.tagId, tagName: tags.name })
    .from(caseTags)
    .innerJoin(tags, eq(tags.id, caseTags.tagId))
    .where(and(inArray(caseTags.caseId, caseIds), eq(tags.isActive, true)))
    .orderBy(asc(caseTags.caseId), asc(tags.name), asc(tags.id));
}

/**
 * Purpose-built bounded read model for /admin/cases.
 *
 * Filtering/counting and pagination happen in SQL. Tag relationship
 * enrichment is a second query restricted to the visible Case IDs.
 *
 * @param {LearningDb} db
 * @param {{ search: string, tagId: string }} filters
 * @param {{ page?: number, pageSize?: number }} [options]
 */
export async function getCaseLibraryPage(db, filters, options = {}) {
  const pageSize = Math.max(1, Math.min(Number(options.pageSize ?? CASE_LIBRARY_PAGE_SIZE) || CASE_LIBRARY_PAGE_SIZE, CASE_LIBRARY_PAGE_SIZE));
  const requestedPage = Math.max(1, Number(options.page ?? 1) || 1);
  const where = and(...caseLibraryConditions(filters));
  const countRows = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(cases).where(where);
  const totalCount = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const rawRows = await db
    .select({
      id: cases.id,
      title: cases.title,
      vignetteMd: cases.vignetteMd,
      conceptId: caseConcepts.conceptId,
      conceptName: concepts.name
    })
    .from(cases)
    .leftJoin(caseConcepts, and(eq(caseConcepts.caseId, cases.id), eq(caseConcepts.role, 'primary')))
    .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(where)
    .orderBy(asc(cases.title), asc(cases.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const caseIds = rawRows.map((row) => row.id);
  const tagRows = await listPageCaseTags(db, caseIds);
  /** @type {Map<string, { id: string, name: string }[]>} */
  const tagsByCase = new Map();
  for (const tag of tagRows) {
    const current = tagsByCase.get(tag.caseId) ?? [];
    current.push({ id: tag.tagId, name: tag.tagName });
    tagsByCase.set(tag.caseId, current);
  }

  return {
    rows: rawRows.map((row) => ({ ...row, tags: tagsByCase.get(row.id) ?? [] })),
    totalCount,
    totalPages,
    page,
    pageSize,
    requestedPage
  };
}