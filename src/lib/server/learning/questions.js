/**
 * @typedef {object} QuestionInput
 * @property {string} questionPromptId
 * @property {string} promptMd
 * @property {string} answerMd
 * @property {boolean} [isActive]
 * @property {boolean} [inheritToDescendants]
 * @property {number} [distance]
 * @property {string | null} [sourceConceptId]
 * @property {string | null} [sourceStimulusGroupId]
 * @property {string | null} [sourceStimulusOptionId]
 * @property {string | null} [stimulusGroupId]
 * @property {string | null} [stimulusOptionId]
 */

/**
 * @typedef {object} ResolvedQuestion
 * @property {string} questionPromptId
 * @property {string} promptMd
 * @property {string} answerMd
 * @property {string} sourceType
 * @property {string | null} sourceConceptId
 * @property {string | null} sourceStimulusGroupId
 * @property {string | null} sourceStimulusOptionId
 * @property {string | null} stimulusGroupId
 * @property {string | null} stimulusOptionId
 * @property {number} [displayOrder]
 */

/** @param {{ isActive?: boolean } | null | undefined} item */
function isActive(item) {
  return item?.isActive !== false;
}

/**
 * @param {Partial<QuestionInput> | null | undefined} item
 * @param {string} label
 * @returns {asserts item is QuestionInput}
 */
function assertQuestion(item, label) {
  if (!item?.questionPromptId) {
    throw new Error(`${label} is missing questionPromptId.`);
  }

  if (typeof item.promptMd !== 'string' || typeof item.answerMd !== 'string') {
    throw new Error(`${label} must contain promptMd and answerMd strings.`);
  }
}

/**
 * @param {QuestionInput} item
 * @param {string} sourceType
 * @param {string | null} [sourceConceptId]
 * @returns {ResolvedQuestion}
 */
/** @param {QuestionInput} item @param {string} sourceType @param {string|null} [sourceConceptId] @param {string|null} [sourceStimulusGroupId] @param {string|null} [sourceStimulusOptionId] @returns {ResolvedQuestion} */
function resolvedQuestion(item, sourceType, sourceConceptId = null, sourceStimulusGroupId = null, sourceStimulusOptionId = null) {
  return {
    questionPromptId: item.questionPromptId,
    promptMd: item.promptMd,
    answerMd: item.answerMd,
    sourceType,
    sourceConceptId,
    sourceStimulusGroupId,
    sourceStimulusOptionId,
    stimulusGroupId: item.stimulusGroupId ?? sourceStimulusGroupId ?? null,
    stimulusOptionId: item.stimulusOptionId ?? sourceStimulusOptionId ?? null
  };
}

/**
 * Resolve the eligible question pool for one Case.
 *
 * Precedence for duplicate prompt IDs:
 * Case > primary Concept > nearest inheritable ancestor > distant ancestor.
 *
 * `ancestorConceptQuestions` must include a positive integer `distance`, where
 * 1 is the primary Concept's parent, 2 is its grandparent, and so on.
 *
 * @param {{ caseQuestions?: QuestionInput[], primaryConceptQuestions?: QuestionInput[], ancestorConceptQuestions?: QuestionInput[], stimulusGroupQuestions?: QuestionInput[], stimulusOptionQuestions?: QuestionInput[] }} [input]
 * @returns {ResolvedQuestion[]}
 */
export function resolveQuestionPool({
  caseQuestions = [],
  primaryConceptQuestions = [],
  ancestorConceptQuestions = [],
  stimulusGroupQuestions = [],
  stimulusOptionQuestions = []
} = {}) {
  /** @type {Map<string, ResolvedQuestion>} */
  const byPrompt = new Map();

  const ancestors = ancestorConceptQuestions
    .filter(isActive)
    .filter((question) => question.inheritToDescendants === true)
    .map((question, index) => {
      assertQuestion(question, `ancestorConceptQuestions[${index}]`);

      if (
        typeof question.distance !== 'number' ||
        !Number.isInteger(question.distance) ||
        question.distance < 1
      ) {
        throw new Error(`ancestorConceptQuestions[${index}] must have a positive integer distance.`);
      }

      return /** @type {QuestionInput & { distance: number }} */ (question);
    })
    // Distant ancestors first so nearer ancestors overwrite them.
    .sort((a, b) => b.distance - a.distance);

  for (const question of ancestors) {
    byPrompt.set(
      question.questionPromptId,
      resolvedQuestion(question, 'ancestor_concept', question.sourceConceptId ?? null)
    );
  }

  primaryConceptQuestions.filter(isActive).forEach((question, index) => {
    assertQuestion(question, `primaryConceptQuestions[${index}]`);
    byPrompt.set(
      question.questionPromptId,
      resolvedQuestion(question, 'concept', question.sourceConceptId ?? null)
    );
  });

  caseQuestions.filter(isActive).forEach((question, index) => {
    assertQuestion(question, `caseQuestions[${index}]`);
    byPrompt.set(question.questionPromptId, resolvedQuestion(question, 'case'));
  });

  stimulusGroupQuestions.filter(isActive).forEach((question, index) => {
    assertQuestion(question, `stimulusGroupQuestions[${index}]`);
    if (!question.stimulusGroupId) throw new Error(`stimulusGroupQuestions[${index}] is missing stimulusGroupId.`);
    const existing = byPrompt.get(question.questionPromptId);
    if (existing?.sourceType === 'stimulus_group' && existing.stimulusGroupId !== question.stimulusGroupId) {
      throw new Error('The same Question Prompt cannot be independently attached to multiple selected Stimulus Groups.');
    }
    byPrompt.set(
      question.questionPromptId,
      resolvedQuestion(question, 'stimulus_group', null, question.stimulusGroupId, null)
    );
  });

  stimulusOptionQuestions.filter(isActive).forEach((question, index) => {
    assertQuestion(question, `stimulusOptionQuestions[${index}]`);
    if (!question.stimulusGroupId || !question.stimulusOptionId) {
      throw new Error(`stimulusOptionQuestions[${index}] is missing stimulus option context.`);
    }
    const existing = byPrompt.get(question.questionPromptId);
    if (
      existing?.sourceType === 'stimulus_option' &&
      (existing.stimulusGroupId !== question.stimulusGroupId || existing.stimulusOptionId !== question.stimulusOptionId)
    ) {
      throw new Error('The same Question Prompt cannot be independently attached to multiple selected Stimulus Groups.');
    }
    byPrompt.set(
      question.questionPromptId,
      resolvedQuestion(question, 'stimulus_option', null, question.stimulusGroupId, question.stimulusOptionId)
    );
  });

  return [...byPrompt.values()];
}

/**
 * Pick the questions to snapshot into one Review.
 *
 * Automatic mode preserves the V1 target of 3 questions and cap of 4.
 * All mode returns the whole resolved pool and fixed mode requests N.
 *
 * @template {{ questionPromptId: string, stimulusGroupId?: string | null }} T
 * @param {T[]} pool
 * @param {{ count?: number, mode?: 'automatic' | 'all' | 'fixed', rng?: () => number, groupCoverage?: { groupId: string, mode?: 'none' | 'minimum' | 'all', minimum?: number }[] }} [options]
 * @returns {(T & { displayOrder: number })[]}
 */
export function pickReviewQuestions(pool, { count = 3, mode = 'automatic', rng = Math.random, groupCoverage = [] } = {}) {
  if (!Array.isArray(pool)) {
    throw new Error('Question pool must be an array.');
  }

  if (typeof rng !== 'function') {
    throw new Error('rng must be a function.');
  }

  if (pool.length === 0) {
    return [];
  }

  const shuffled = [...pool];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = rng();
    const boundedRandom = Math.min(Math.max(randomValue, 0), 0.9999999999999999);
    const swapIndex = Math.floor(boundedRandom * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  const required = [];
  for (const coverage of groupCoverage) {
    const specific = shuffled.filter((question) => question.stimulusGroupId === coverage.groupId);
    if (coverage.mode === 'all') required.push(...specific);
    if (coverage.mode === 'minimum') {
      const minimum = typeof coverage.minimum === 'number' && Number.isInteger(coverage.minimum) ? coverage.minimum : 0;
      if (specific.length < minimum) {
        throw new Error(`Stimulus Group ${coverage.groupId} requires at least ${minimum} specific questions, but only ${specific.length} are eligible.`);
      }
      required.push(...specific.slice(0, minimum));
    }
  }
  const requiredIds = new Set(required.map((question) => question.questionPromptId));
  const requestedCount = Number.isFinite(count) ? Math.floor(count) : 3;
  if (mode === 'fixed' && required.length > Math.max(requestedCount, 1)) {
    throw new Error('The configured stimulus-specific question coverage cannot fit within the Case question count.');
  }
  const baseTarget = mode === 'all' ? pool.length : mode === 'fixed' ? Math.max(requestedCount, 1) : Math.min(Math.max(requestedCount, 1), 4);
  const target = mode === 'automatic'
    ? Math.min(Math.max(baseTarget, required.length), required.length > 4 ? required.length : 4, pool.length)
    : Math.min(Math.max(baseTarget, required.length), pool.length);
  if (required.length > target) {
    throw new Error('The configured stimulus-specific question coverage cannot fit within the Case question count.');
  }
  const selected = [...required, ...shuffled.filter((question) => !requiredIds.has(question.questionPromptId))].slice(0, target);
  return selected.map((question, displayOrder) => ({
    ...question,
    displayOrder
  }));
}
