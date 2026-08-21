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
async function listPagePrimaryTopics(db, caseIds) {
  if (!caseIds.length) return [];
  return db
    .select({
      caseId: caseConcepts.caseId,
      conceptId: caseConcepts.conceptId,
      conceptName: concepts.name
    })
    .from(caseConcepts)
    .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(inArray(caseConcepts.caseId, caseIds), eq(caseConcepts.role, 'primary')))
    .orderBy(asc(caseConcepts.caseId), asc(concepts.name), asc(caseConcepts.conceptId));
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
 * Filtering/counting and pagination happen against Cases only. Primary Topic
 * and Tag relationship enrichment are then restricted to the visible Case IDs,
 * so malformed duplicate primary relationships cannot consume page slots.
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
      vignetteMd: cases.vignetteMd
    })
    .from(cases)
    .where(where)
    .orderBy(asc(cases.title), asc(cases.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const caseIds = rawRows.map((row) => row.id);
  const [primaryRows, tagRows] = await Promise.all([listPagePrimaryTopics(db, caseIds), listPageCaseTags(db, caseIds)]);

  /** @type {Map<string, { conceptId: string, conceptName: string | null }>} */
  const primaryByCase = new Map();
  for (const primary of primaryRows) {
    if (!primaryByCase.has(primary.caseId)) {
      primaryByCase.set(primary.caseId, { conceptId: primary.conceptId, conceptName: primary.conceptName });
    }
  }

  /** @type {Map<string, { id: string, name: string }[]>} */
  const tagsByCase = new Map();
  for (const tag of tagRows) {
    const current = tagsByCase.get(tag.caseId) ?? [];
    current.push({ id: tag.tagId, name: tag.tagName });
    tagsByCase.set(tag.caseId, current);
  }

  return {
    rows: rawRows.map((row) => ({
      ...row,
      conceptId: primaryByCase.get(row.id)?.conceptId ?? null,
      conceptName: primaryByCase.get(row.id)?.conceptName ?? null,
      tags: tagsByCase.get(row.id) ?? []
    })),
    totalCount,
    totalPages,
    page,
    pageSize,
    requestedPage
  };
}