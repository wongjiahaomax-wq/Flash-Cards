import { and, asc, eq, isNull } from 'drizzle-orm';

import { taxonomyConcepts as concepts } from './contextual-schema.ts';
import { caseConcepts, cases, conceptQuestions, questionPrompts } from './schema.js';
import { systemTags, tags } from './tag-schema.js';
import { loadStudyNavigationSnapshot } from './study-navigation.ts';
import {
  buildSystemStudyNavigation,
  resolveSystemStudyCandidates
} from '../learning/system-study-routes.ts';
import {
  conceptBreadcrumb,
  descendantConceptIds,
  systemAncestorId,
  type TaxonomyNode
} from '../learning/taxonomy-graph.ts';
import { resolveCaseStudyCandidates } from '../learning/study-routes.js';

function cleanText(value: unknown) {
  return String(value ?? '').trim();
}

async function loadAllConcepts(db: import('./index.js').LearningDb) {
  return db
    .select({
      id: concepts.id,
      name: concepts.name,
      slug: concepts.slug,
      descriptionMd: concepts.descriptionMd,
      kind: concepts.kind,
      parentId: concepts.parentId,
      isActive: concepts.isActive
    })
    .from(concepts)
    .orderBy(asc(concepts.name), asc(concepts.id));
}

export async function listTaxonomyLibrary(
  db: import('./index.js').LearningDb,
  filters: { search?: string } = {}
) {
  const [conceptRows, directCaseRows, studyRows, questionRows] = await Promise.all([
    loadAllConcepts(db),
    db
      .select({ conceptId: caseConcepts.conceptId, caseId: cases.id })
      .from(caseConcepts)
      .innerJoin(cases, eq(cases.id, caseConcepts.caseId))
      .where(and(
        eq(caseConcepts.role, 'primary'),
        eq(cases.isActive, true),
        isNull(cases.previewSessionId)
      )),
    db
      .select({
        id: cases.id,
        title: cases.title,
        vignetteMd: cases.vignetteMd,
        isActive: cases.isActive,
        conceptId: caseConcepts.conceptId,
        role: caseConcepts.role
      })
      .from(caseConcepts)
      .innerJoin(cases, eq(cases.id, caseConcepts.caseId))
      .where(and(
        eq(caseConcepts.role, 'primary'),
        eq(cases.isActive, true),
        isNull(cases.previewSessionId)
      )),
    db
      .select({ conceptId: conceptQuestions.conceptId, questionId: conceptQuestions.id })
      .from(conceptQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, conceptQuestions.questionPromptId))
      .innerJoin(concepts, eq(concepts.id, conceptQuestions.conceptId))
      .where(and(
        eq(conceptQuestions.isActive, true),
        eq(questionPrompts.isActive, true),
        isNull(questionPrompts.previewSessionId),
        eq(concepts.isActive, true)
      ))
  ]);

  const activeNodes = conceptRows.filter((row) => row.isActive) as TaxonomyNode[];
  const directCaseCounts = new Map<string, number>();
  const directCasesByTopic = new Map<string, { id: string; title: string }[]>();
  const questionCounts = new Map<string, number>();
  for (const row of directCaseRows) directCaseCounts.set(row.conceptId, (directCaseCounts.get(row.conceptId) ?? 0) + 1);
  for (const row of studyRows) {
    const current = directCasesByTopic.get(row.conceptId) ?? [];
    current.push({ id: row.id, title: row.title });
    directCasesByTopic.set(row.conceptId, current);
  }
  for (const caseRows of directCasesByTopic.values()) {
    caseRows.sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));
  }
  for (const row of questionRows) questionCounts.set(row.conceptId, (questionCounts.get(row.conceptId) ?? 0) + 1);

  const search = cleanText(filters.search).toLocaleLowerCase();
  return conceptRows
    .map((concept) => {
      const breadcrumb = conceptBreadcrumb(concept.id, conceptRows as TaxonomyNode[]).map((item) => ({
        id: item.id,
        name: item.name ?? item.id,
        kind: item.kind
      }));
      const systemId = concept.kind === 'system' ? concept.id : systemAncestorId(concept.id, conceptRows as TaxonomyNode[]);
      const descendantStudyCaseCount = concept.isActive
        ? resolveCaseStudyCandidates({ selectedConceptId: concept.id, concepts: activeNodes, rows: studyRows }).length
        : 0;
      return {
        ...concept,
        breadcrumb,
        breadcrumbLabel: breadcrumb.map((item) => item.name).join(' → '),
        systemId,
        unassigned: concept.kind === 'topic' && !systemId,
        directCaseCount: concept.isActive ? (directCaseCounts.get(concept.id) ?? 0) : 0,
        directCases: concept.kind === 'topic' && concept.isActive ? (directCasesByTopic.get(concept.id) ?? []) : [],
        descendantStudyCaseCount,
        activeSharedQuestionCount: concept.isActive ? (questionCounts.get(concept.id) ?? 0) : 0
      };
    })
    .filter((concept) => !search || concept.name.toLocaleLowerCase().includes(search) || concept.breadcrumbLabel.toLocaleLowerCase().includes(search))
    .sort((left, right) => left.breadcrumbLabel.localeCompare(right.breadcrumbLabel) || left.id.localeCompare(right.id));
}

export async function getTaxonomyCoverageReport(db: import('./index.js').LearningDb) {
  const snapshot = await loadStudyNavigationSnapshot(db);
  const systems = buildSystemStudyNavigation(snapshot);
  const activeNodes = snapshot.concepts as TaxonomyNode[];
  const unassignedTopics = activeNodes
    .filter((node) => node.kind === 'topic' && !systemAncestorId(node.id, activeNodes))
    .map((node) => ({ id: node.id, name: node.name ?? node.id }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

  const rowsByCase = new Map<string, typeof snapshot.caseTopicRows>();
  for (const row of snapshot.caseTopicRows) {
    const rows = rowsByCase.get(row.id) ?? [];
    rows.push(row);
    rowsByCase.set(row.id, rows);
  }
  const casesWithoutSystemTopic = [...rowsByCase.entries()].flatMap(([caseId, rows]) => {
    const attachedToSystem = rows.some((row) => systemAncestorId(row.conceptId, activeNodes));
    if (attachedToSystem) return [];
    return [{ id: caseId, title: rows[0]?.title ?? caseId }];
  }).sort((left, right) => String(left.title).localeCompare(String(right.title)) || left.id.localeCompare(right.id));

  const coveredCaseIds = new Set<string>();
  for (const system of systems) {
    for (const candidate of resolveSystemStudyCandidates({ ...snapshot, systemId: system.id, routeType: 'all' })) {
      coveredCaseIds.add(candidate.id);
    }
  }
  const uncoveredCases = [...rowsByCase.entries()].flatMap(([caseId, rows]) => coveredCaseIds.has(caseId)
    ? []
    : [{ id: caseId, title: rows[0]?.title ?? caseId }]
  ).sort((left, right) => String(left.title).localeCompare(String(right.title)) || left.id.localeCompare(right.id));

  return {
    activeSystemCount: activeNodes.filter((node) => node.kind === 'system').length,
    activeTopicCount: activeNodes.filter((node) => node.kind === 'topic').length,
    activeProductionCaseCount: rowsByCase.size,
    unassignedTopics,
    casesWithoutSystemTopic,
    uncoveredCases,
    readyForLearnerSystemNavigation: unassignedTopics.length === 0 && uncoveredCases.length === 0 && systems.length > 0
  };
}

export async function getSystemCoverage(db: import('./index.js').LearningDb, systemId: string) {
  const [allConceptRows, snapshot, allSystemTagRows] = await Promise.all([
    loadAllConcepts(db),
    loadStudyNavigationSnapshot(db),
    db
      .select({
        tagId: systemTags.tagId,
        tagName: tags.name,
        tagIsActive: tags.isActive,
        displayOrder: systemTags.displayOrder
      })
      .from(systemTags)
      .innerJoin(tags, eq(tags.id, systemTags.tagId))
      .where(eq(systemTags.systemConceptId, systemId))
      .orderBy(asc(systemTags.displayOrder), asc(tags.name), asc(tags.id))
  ]);

  const system = allConceptRows.find((row) => row.id === systemId && row.kind === 'system');
  if (!system) return null;
  const activeSystem = snapshot.concepts.some((row) => row.id === systemId && row.kind === 'system');
  const descendantIds = new Set(descendantConceptIds(systemId, allConceptRows as TaxonomyNode[]));
  const descendantTopics = allConceptRows
    .filter((row) => descendantIds.has(row.id) && row.kind === 'topic')
    .map((topic) => {
      const eligible = activeSystem && topic.isActive
        ? resolveSystemStudyCandidates({ ...snapshot, systemId, routeType: 'topic', routeId: topic.id })
        : [];
      return {
        id: topic.id,
        name: topic.name,
        isActive: topic.isActive,
        breadcrumb: conceptBreadcrumb(topic.id, allConceptRows as TaxonomyNode[]).map((item) => ({ id: item.id, name: item.name ?? item.id, kind: item.kind })),
        caseCount: eligible.length
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

  const curatedTags = allSystemTagRows.map((tag) => ({
    ...tag,
    caseCount: activeSystem && tag.tagIsActive
      ? resolveSystemStudyCandidates({ ...snapshot, systemId, routeType: 'tag', routeId: tag.tagId }).length
      : 0
  }));

  const caseRoutes = new Map<string, { id: string; title: string; routes: { type: 'topic' | 'tag'; id: string; label: string }[] }>();
  const addRoute = (candidate: { id: string; title?: string }, route: { type: 'topic' | 'tag'; id: string; label: string }) => {
    const entry = caseRoutes.get(candidate.id) ?? { id: candidate.id, title: candidate.title ?? candidate.id, routes: [] };
    if (!entry.routes.some((existing) => existing.type === route.type && existing.id === route.id)) entry.routes.push(route);
    caseRoutes.set(candidate.id, entry);
  };

  if (activeSystem) {
    for (const topic of descendantTopics.filter((item) => item.isActive && item.caseCount > 0)) {
      for (const candidate of resolveSystemStudyCandidates({ ...snapshot, systemId, routeType: 'topic', routeId: topic.id })) {
        addRoute(candidate, { type: 'topic', id: topic.id, label: topic.name });
      }
    }
    for (const tag of curatedTags.filter((item) => item.tagIsActive && item.caseCount > 0)) {
      for (const candidate of resolveSystemStudyCandidates({ ...snapshot, systemId, routeType: 'tag', routeId: tag.tagId })) {
        addRoute(candidate, { type: 'tag', id: tag.tagId, label: tag.tagName });
      }
    }
  }

  const overlapCases = [...caseRoutes.values()]
    .filter((entry) => entry.routes.length > 1)
    .map((entry) => ({ ...entry, routes: entry.routes.sort((left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id)) }))
    .sort((left, right) => left.title.localeCompare(right.title) || left.id.localeCompare(right.id));

  return {
    descendantTopics,
    curatedTags,
    allCaseCount: activeSystem ? resolveSystemStudyCandidates({ ...snapshot, systemId, routeType: 'all' }).length : 0,
    overlapCases
  };
}

export async function getTaxonomyDetail(db: import('./index.js').LearningDb, conceptId: string) {
  const [libraryRows, allConceptRows, caseRows, questionRows] = await Promise.all([
    listTaxonomyLibrary(db),
    loadAllConcepts(db),
    db
      .select({
        caseId: cases.id,
        caseTitle: cases.title,
        caseIsActive: cases.isActive,
        role: caseConcepts.role
      })
      .from(caseConcepts)
      .innerJoin(cases, eq(cases.id, caseConcepts.caseId))
      .where(and(
        eq(caseConcepts.conceptId, conceptId),
        eq(caseConcepts.role, 'primary'),
        isNull(cases.previewSessionId)
      ))
      .orderBy(asc(cases.title), asc(cases.id)),
    db
      .select({
        usageId: conceptQuestions.id,
        promptId: questionPrompts.id,
        promptMd: questionPrompts.promptMd,
        promptIsActive: questionPrompts.isActive,
        answerMd: conceptQuestions.answerMd,
        inheritToDescendants: conceptQuestions.inheritToDescendants,
        usageIsActive: conceptQuestions.isActive
      })
      .from(conceptQuestions)
      .innerJoin(questionPrompts, eq(questionPrompts.id, conceptQuestions.questionPromptId))
      .where(and(eq(conceptQuestions.conceptId, conceptId), isNull(questionPrompts.previewSessionId)))
      .orderBy(asc(questionPrompts.promptMd), asc(conceptQuestions.id))
  ]);

  const enriched = libraryRows.find((row) => row.id === conceptId);
  const topic = allConceptRows.find((row) => row.id === conceptId);
  if (!topic || !enriched) return null;
  const parent = topic.parentId ? allConceptRows.find((row) => row.id === topic.parentId) ?? null : null;
  const children = allConceptRows
    .filter((row) => row.parentId === conceptId)
    .map((row) => ({ id: row.id, name: row.name, kind: row.kind, slug: row.slug, isActive: row.isActive }))
    .sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));

  return {
    ...topic,
    ...enriched,
    parent: parent ? { id: parent.id, name: parent.name, kind: parent.kind, slug: parent.slug, isActive: parent.isActive } : null,
    children,
    cases: caseRows,
    questions: questionRows,
    systemCoverage: topic.kind === 'system' ? await getSystemCoverage(db, conceptId) : null
  };
}
