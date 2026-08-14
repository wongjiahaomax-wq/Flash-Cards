function isActive(item) {
  return item?.isActive !== false;
}

function assertQuestion(item, label) {
  if (!item?.questionPromptId) {
    throw new Error(`${label} is missing questionPromptId.`);
  }

  if (typeof item.promptMd !== 'string' || typeof item.answerMd !== 'string') {
    throw new Error(`${label} must contain promptMd and answerMd strings.`);
  }
}

function resolvedQuestion(item, sourceType, sourceConceptId = null) {
  return {
    questionPromptId: item.questionPromptId,
    promptMd: item.promptMd,
    answerMd: item.answerMd,
    sourceType,
    sourceConceptId
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
 */
export function resolveQuestionPool({
  caseQuestions = [],
  primaryConceptQuestions = [],
  ancestorConceptQuestions = []
} = {}) {
  const byPrompt = new Map();

  const ancestors = ancestorConceptQuestions
    .filter(isActive)
    .filter((question) => question.inheritToDescendants === true)
    .map((question, index) => {
      assertQuestion(question, `ancestorConceptQuestions[${index}]`);

      if (!Number.isInteger(question.distance) || question.distance < 1) {
        throw new Error(`ancestorConceptQuestions[${index}] must have a positive integer distance.`);
      }

      return question;
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

  return [...byPrompt.values()];
}

/**
 * Pick the questions to snapshot into one Review.
 *
 * V1 targets 3 questions and never displays more than 4. Injecting `rng`
 * keeps the function deterministic in tests without changing production use.
 */
export function pickReviewQuestions(pool, { count = 3, rng = Math.random } = {}) {
  if (!Array.isArray(pool)) {
    throw new Error('Question pool must be an array.');
  }

  if (typeof rng !== 'function') {
    throw new Error('rng must be a function.');
  }

  if (pool.length === 0) {
    return [];
  }

  const requestedCount = Number.isFinite(count) ? Math.floor(count) : 3;
  const target = Math.min(Math.max(requestedCount, 1), 4, pool.length);
  const shuffled = [...pool];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomValue = rng();
    const boundedRandom = Math.min(Math.max(randomValue, 0), 0.9999999999999999);
    const swapIndex = Math.floor(boundedRandom * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled.slice(0, target).map((question, displayOrder) => ({
    ...question,
    displayOrder
  }));
}
