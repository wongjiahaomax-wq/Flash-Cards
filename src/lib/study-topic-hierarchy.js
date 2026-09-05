/**
 * Shared learner Topic-hierarchy helpers.
 *
 * Topic study routes use exact Topic membership. A structural Topic with zero
 * exact Cases is therefore a UI control for its descendant exact-Topic routes;
 * it must never become a submitted route itself.
 */

/** @param {{breadcrumb?:Array<{id:string}>}} topic */
export function studyTopicParentId(topic) {
  const breadcrumb = Array.isArray(topic?.breadcrumb) ? topic.breadcrumb : [];
  return breadcrumb.length >= 2 ? breadcrumb[breadcrumb.length - 2]?.id ?? null : null;
}

/** @param {{breadcrumb?:Array<unknown>}} topic */
export function studyTopicDepth(topic) {
  const breadcrumb = Array.isArray(topic?.breadcrumb) ? topic.breadcrumb : [];
  return Math.max(0, breadcrumb.length - 2);
}

/**
 * @template {{id:string,name:string,breadcrumb?:Array<{id:string}>}} T
 * @param {readonly T[]} topics
 * @returns {T[]}
 */
export function orderedStudyTopics(topics) {
  const nodes = [...topics];
  const topicIds = new Set(nodes.map((topic) => topic.id));
  /** @type {Map<string|null,T[]>} */
  const children = new Map();
  for (const topic of nodes) {
    const parentId = studyTopicParentId(topic);
    const key = parentId && topicIds.has(parentId) ? parentId : null;
    const siblings = children.get(key) ?? [];
    siblings.push(topic);
    children.set(key, siblings);
  }
  for (const siblings of children.values()) {
    siblings.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id));
  }
  /** @type {T[]} */
  const ordered = [];
  /** @param {string|null} parentId */
  const visit = (parentId) => {
    for (const topic of children.get(parentId) ?? []) {
      ordered.push(topic);
      visit(topic.id);
    }
  };
  visit(null);
  return ordered;
}

/**
 * @param {readonly {id:string,breadcrumb?:Array<{id:string}>}[]} topics
 * @param {string} topicId
 * @returns {string[]}
 */
export function studyTopicDescendantIds(topics, topicId) {
  /** @type {string[]} */
  const ids = [];
  /** @param {string} currentId */
  const visit = (currentId) => {
    for (const child of topics.filter((topic) => studyTopicParentId(topic) === currentId)) {
      ids.push(child.id);
      visit(child.id);
    }
  };
  visit(topicId);
  return ids;
}

/**
 * Return only exact-Topic routes in the subtree. Structural parents with zero
 * exact Cases intentionally contribute no route of their own.
 * @param {readonly {id:string,caseCount:number,breadcrumb?:Array<{id:string}>}[]} topics
 * @param {string} topicId
 * @returns {string[]}
 */
export function studyTopicSubtreeRouteValues(topics, topicId) {
  /** @type {string[]} */
  const routes = [];
  /** @param {string} currentId */
  const visit = (currentId) => {
    const current = topics.find((topic) => topic.id === currentId);
    if (current && Number(current.caseCount) > 0) routes.push(`topic:${currentId}`);
    for (const child of topics.filter((topic) => studyTopicParentId(topic) === currentId)) {
      visit(child.id);
    }
  };
  visit(topicId);
  return routes;
}

/**
 * @param {{topics:readonly {id:string,caseCount:number}[],tags:readonly {id:string}[]}} system
 * @returns {string[]}
 */
export function contributingStudyRouteValues(system) {
  return [
    ...system.topics
      .filter((topic) => Number(topic.caseCount) > 0)
      .map((topic) => `topic:${topic.id}`),
    ...system.tags.map((tag) => `tag:${tag.id}`)
  ];
}
