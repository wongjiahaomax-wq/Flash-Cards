import { and, asc, desc, eq, inArray, isNull, like, sql } from 'drizzle-orm';

import { conceptBreadcrumb, systemAncestorId } from '../learning/taxonomy-graph.ts';
import { listConceptTaxonomy } from './concept-taxonomy-compat.ts';
import { caseConcepts, cases, concepts } from './schema.js';
import { caseTags, tags } from './tag-schema.js';

/** @typedef {import('./index.js').LearningDb} LearningDb */
/** @typedef {{ id: string, name: string, slug: string, kind: string, parentId: string | null }} TaxonomyRow */

export const CASE_LIBRARY_PAGE_SIZE = 60;

/**
 * @param {URLSearchParams | { get(name: string): string | null }} params
 * @returns {{ search: string, topicSearch: string, systemSearch: string, tagId: string, sort: string, lifecycle: 'active'|'inactive' }}
 */
export function parseCaseLibraryFilters(params) {
  const sort = params.get('sort')?.trim() ?? '';
  return {
    search: params.get('q')?.trim() ?? '',
    topicSearch: params.get('topic')?.trim() ?? '',
    systemSearch: params.get('system')?.trim() ?? '',
    tagId: params.get('tag')?.trim() ?? '',
    sort: ['case-asc', 'case-desc', 'topic-asc', 'topic-desc', 'system-asc', 'system-desc', 'tag-asc', 'tag-desc'].includes(sort) ? sort : 'case-asc',
    lifecycle: params.get('lifecycle') === 'inactive' ? 'inactive' : 'active'
  };
}

/** @param {URLSearchParams | { get(name: string): string | null }} params */
export function parseCaseLibraryPage(params) {
  const raw = Number(params.get('page') ?? 1);
  return Number.isSafeInteger(raw) && raw > 0 ? raw : 1;
}

/** @param {{ search: string, topicSearch?: string, systemSearch?: string, systemIds?: string[], tagId: string, lifecycle?: 'active'|'inactive' }} filters */
function caseLibraryConditions(filters) {
  const inactiveView = filters.lifecycle === 'inactive';
  const conditions = [eq(cases.isActive, inactiveView ? false : true), isNull(cases.previewSessionId)];
  if (filters.search) conditions.push(like(cases.title, `%${filters.search.toLowerCase()}%`));
  if (filters.topicSearch) {
    conditions.push(sql`exists (
      select 1
      from case_concepts filter_case_concepts
      join concepts filter_concepts on filter_concepts.id = filter_case_concepts.concept_id
      where filter_case_concepts.case_id = ${cases.id}
        and filter_case_concepts.role = 'primary'
        and lower(filter_concepts.name) like ${`%${filters.topicSearch.toLowerCase()}%`}
    )`);
  }
  if (filters.systemSearch && filters.systemIds?.length) {
    conditions.push(sql`exists (
      with recursive topic_ancestors(id, parent_id, kind, name) as (
        select primary_concepts.id, primary_concepts.parent_id, null, primary_concepts.name
        from concepts primary_concepts
        where primary_concepts.id = (
          select primary_case_concepts.concept_id
          from case_concepts primary_case_concepts
          where primary_case_concepts.case_id = ${cases.id}
            and primary_case_concepts.role = 'primary'
          limit 1
        )
        union all
        select parent_concepts.id, parent_concepts.parent_id, null, parent_concepts.name
        from concepts parent_concepts
        join topic_ancestors on topic_ancestors.parent_id = parent_concepts.id
      )
      select 1 from topic_ancestors
      where topic_ancestors.id in (${sql.join(filters.systemIds.map((id) => sql`${id}`), sql`, `)})
        and lower(topic_ancestors.name) like ${`%${filters.systemSearch.toLowerCase()}%`}
    )`);
  }
  if (filters.tagId) {
    conditions.push(inactiveView
      ? sql`exists (
          select 1
          from case_tags filter_case_tags
          where filter_case_tags.case_id = ${cases.id}
            and filter_case_tags.tag_id = ${filters.tagId}
        )`
      : sql`exists (
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

/** @param {TaxonomyRow[]} conceptRows */
function caseLibraryTopicOptions(conceptRows) {
  return conceptRows
    .filter((concept) => concept.kind === 'topic')
    .map((concept) => ({
      id: concept.id,
      name: concept.name,
      slug: concept.slug,
      breadcrumb: conceptBreadcrumb(concept.id, conceptRows).map((item) => ({
        id: item.id,
        name: item.name ?? item.id,
        kind: item.kind
      }))
    }));
}

/** @param {LearningDb} db @param {string[]} caseIds @param {TaxonomyRow[]} conceptRows */
async function listPagePrimaryTopics(db, caseIds, conceptRows) {
  if (!caseIds.length) return [];
  const rows = await db
    .select({
      caseId: caseConcepts.caseId,
      conceptId: caseConcepts.conceptId,
      conceptName: concepts.name
    })
    .from(caseConcepts)
    .leftJoin(concepts, eq(concepts.id, caseConcepts.conceptId))
    .where(and(inArray(caseConcepts.caseId, caseIds), eq(caseConcepts.role, 'primary')))
    .orderBy(asc(caseConcepts.caseId), asc(concepts.name), asc(caseConcepts.conceptId));
  const systemNames = new Map(conceptRows.filter((concept) => concept.kind === 'system').map((concept) => [concept.id, concept.name]));
  return rows.map((row) => ({
    ...row,
    systemName: row.conceptId ? systemNames.get(systemAncestorId(row.conceptId, conceptRows) ?? '') ?? null : null
  }));
}

/** @param {LearningDb} db @param {string[]} caseIds @param {boolean} includeInactiveTags */
async function listPageCaseTags(db, caseIds, includeInactiveTags) {
  if (!caseIds.length) return [];
  const conditions = [inArray(caseTags.caseId, caseIds)];
  if (!includeInactiveTags) conditions.push(eq(tags.isActive, true));
  return db
    .select({ caseId: caseTags.caseId, tagId: caseTags.tagId, tagName: tags.name })
    .from(caseTags)
    .innerJoin(tags, eq(tags.id, caseTags.tagId))
    .where(and(...conditions))
    .orderBy(asc(caseTags.caseId), asc(tags.name), asc(tags.id));
}

/**
 * Purpose-built bounded read model for /admin/cases.
 *
 * Filtering/counting and pagination happen against Cases only. Primary Topic
 * and Tag relationship enrichment are then restricted to the visible Case IDs,
 * so malformed duplicate primary relationships cannot consume page slots.
 * Lifecycle filtering is explicit and always remains production-only.
 *
 * Active Topic assignment options are derived from the same compatible
 * taxonomy read already required by the Case Library. The inactive recovery
 * view does not expose Topic assignment and therefore returns no such options.
 *
 * @param {LearningDb} db
 * @param {{ search: string, topicSearch?: string, systemSearch?: string, tagId: string, sort?: string, lifecycle?: 'active'|'inactive' }} filters
 * @param {{ page?: number, pageSize?: number }} [options]
 */
export async function getCaseLibraryPage(db, filters, options = {}) {
  const pageSize = Math.max(1, Math.min(Number(options.pageSize ?? CASE_LIBRARY_PAGE_SIZE) || CASE_LIBRARY_PAGE_SIZE, CASE_LIBRARY_PAGE_SIZE));
  const requestedPage = Math.max(1, Number(options.page ?? 1) || 1);
  const inactiveView = filters.lifecycle === 'inactive';
  const conceptRows = await listConceptTaxonomy(db, { activeOnly: !inactiveView });
  const topicOptions = inactiveView ? [] : caseLibraryTopicOptions(conceptRows);
  const matchingSystemIds = conceptRows
    .filter((concept) => concept.kind === 'system' && (!filters.systemSearch || concept.name.toLowerCase().includes(filters.systemSearch.toLowerCase())))
    .map((concept) => concept.id);
  const where = and(...caseLibraryConditions({ ...filters, lifecycle: inactiveView ? 'inactive' : 'active', systemIds: matchingSystemIds }));
  const countRows = await db.select({ count: sql`count(*)`.mapWith(Number) }).from(cases).where(where);
  const totalCount = Number(countRows[0]?.count ?? 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const page = Math.min(requestedPage, totalPages);

  const topicSort = sql`coalesce((select min(${concepts.name}) from ${caseConcepts} inner join ${concepts} on ${concepts.id} = ${caseConcepts.conceptId} where ${caseConcepts.caseId} = ${cases.id} and ${caseConcepts.role} = 'primary'), '')`;
  const tagSort = inactiveView
    ? sql`coalesce((select min(${tags.name}) from ${caseTags} inner join ${tags} on ${tags.id} = ${caseTags.tagId} where ${caseTags.caseId} = ${cases.id}), '')`
    : sql`coalesce((select min(${tags.name}) from ${caseTags} inner join ${tags} on ${tags.id} = ${caseTags.tagId} where ${caseTags.caseId} = ${cases.id} and ${tags.isActive} = true), '')`;
  const sort = filters.sort ?? 'case-asc';
  const systemIds = conceptRows.filter((concept) => concept.kind === 'system').map((concept) => concept.id);
  const systemSort = systemIds.length ? sql`coalesce((
    with recursive system_ancestors(id, parent_id, kind, name) as (
      select topic_concept.id, topic_concept.parent_id, null, topic_concept.name
      from concepts topic_concept
      where topic_concept.id = (
        select primary_case_concepts.concept_id
        from case_concepts primary_case_concepts
        where primary_case_concepts.case_id = ${cases.id}
          and primary_case_concepts.role = 'primary'
        limit 1
      )
      union all
      select parent_concepts.id, parent_concepts.parent_id, null, parent_concepts.name
      from concepts parent_concepts
      join system_ancestors on system_ancestors.parent_id = parent_concepts.id
    )
    select name from system_ancestors where id in (${sql.join(systemIds.map((id) => sql`${id}`), sql`, `)}) limit 1
  ), '')` : sql`''`;
  const sortExpression = sort.startsWith('topic') ? topicSort : sort.startsWith('system') ? systemSort : sort.startsWith('tag') ? tagSort : cases.title;
  const sortDirection = sort.endsWith('desc') ? desc : asc;

  const rawRows = await db
    .select({
      id: cases.id,
      title: cases.title,
      vignetteMd: cases.vignetteMd,
      isActive: cases.isActive
    })
    .from(cases)
    .where(where)
    .orderBy(sortDirection(sortExpression), asc(cases.title), asc(cases.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const caseIds = rawRows.map((row) => row.id);
  const [primaryRows, tagRows] = await Promise.all([
    listPagePrimaryTopics(db, caseIds, conceptRows),
    listPageCaseTags(db, caseIds, inactiveView)
  ]);

  /** @type {Map<string, { conceptId: string, conceptName: string | null, systemName: string | null }>} */
  const primaryByCase = new Map();
  for (const primary of primaryRows) {
    if (!primaryByCase.has(primary.caseId)) {
      primaryByCase.set(primary.caseId, { conceptId: primary.conceptId, conceptName: primary.conceptName, systemName: primary.systemName ?? null });
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
      systemName: primaryByCase.get(row.id)?.systemName ?? null,
      tags: tagsByCase.get(row.id) ?? []
    })),
    topicOptions,
    totalCount,
    totalPages,
    page,
    pageSize,
    requestedPage
  };
}
