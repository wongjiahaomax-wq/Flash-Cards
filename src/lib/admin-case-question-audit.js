/**
 * Compact Case-editor review helpers.
 *
 * These functions intentionally project the bounded Case editor read model.
 * They do not define learner eligibility or introduce a persisted cross-scope
 * question order. The learner resolver remains authoritative for Reviews.
 */

/** @param {unknown} value */
function text(value) {
  return typeof value === 'string' ? value : '';
}

/** @param {unknown} value */
function active(value) {
  return value === true;
}

/** @param {any} selectedCase @param {string} assetId @param {string | null} optionId */
export function reusableSummaryForContext(selectedCase, assetId, optionId = null) {
  /** @type {any[]} */
  const summaries = selectedCase?.reusableImageQuestions ?? [];
  return summaries.find(
    (summary) => summary.assetId === assetId && (summary.stimulusOptionId ?? null) === optionId
  ) ?? { assetId, stimulusOptionId: optionId, total: 0, used: 0, available: 0, questions: [] };
}

/** @param {any} summary */
export function usedReusableQuestions(summary) {
  /** @type {any[]} */
  const questions = summary?.questions ?? [];
  return questions.filter((question) => question.usedInCase === true);
}

/** @param {any} option */
function optionImage(option) {
  return {
    id: option.id,
    assetId: option.assetId,
    imageUrl: option.imageUrl ?? null,
    altText: option.altText ?? '',
    originalFilename: option.originalFilename ?? option.assetId,
    captionMd: option.captionMd ?? null
  };
}

/** @param {any} asset */
function fixedImage(asset) {
  return {
    id: `fixed:${asset.assetId}`,
    assetId: asset.assetId,
    imageUrl: asset.imageUrl ?? null,
    altText: asset.altText ?? '',
    originalFilename: asset.originalFilename ?? asset.assetId,
    captionMd: asset.captionMd ?? null
  };
}

/**
 * Build the deterministic Admin-only “All questions in this Case” projection.
 *
 * Presentation order is intentionally structural rather than educational:
 * whole-Case questions first, then fixed-image contexts, then active
 * Alternative Sets in their loaded display order. Within a set, set-wide rows
 * precede each active option; an option shows Case-specific rows before its
 * explicitly-used reusable Asset rows. Existing ordering inside each scope is
 * preserved from the Case editor read model.
 *
 * @param {any} selectedCase
 * @returns {any[]}
 */
export function buildCaseQuestionAudit(selectedCase) {
  if (!selectedCase) return [];
  /** @type {any[]} */
  const rows = [];
  /** @type {Set<string>} */
  const seen = new Set();

  /** @param {string} key @param {any} row */
  function push(key, row) {
    if (seen.has(key)) return;
    seen.add(key);
    rows.push({ key, ...row });
  }

  /** @type {any[]} */
  const caseQuestions = selectedCase.questions ?? [];
  for (const question of caseQuestions) {
    if (!active(question.isActive ?? true)) continue;
    const promptId = text(question.questionPromptId);
    push(`case:${promptId}`, {
      promptId,
      promptMd: text(question.promptMd),
      answerMd: text(question.answerMd),
      sourceType: 'case',
      sourceLabel: 'CASE-WIDE',
      sourceName: 'This whole Case',
      editTarget: promptId ? `question-${promptId}` : 'questions',
      preview: null
    });
  }

  /** @type {any[]} */
  const attached = selectedCase.attached ?? [];
  for (const asset of attached) {
    if (!active(asset.isActive)) continue;
    const reusable = reusableSummaryForContext(selectedCase, asset.assetId, null);
    for (const question of usedReusableQuestions(reusable)) {
      const identity = text(question.id) || text(question.questionPromptId) || text(question.promptMd);
      push(`reusable:fixed:${asset.assetId}:${identity}`, {
        promptId: text(question.questionPromptId),
        promptMd: text(question.promptMd),
        answerMd: text(question.answerMd),
        sourceType: 'reusable',
        sourceLabel: 'REUSABLE',
        sourceName: asset.originalFilename ?? asset.assetId,
        editTarget: `fixed-image-${asset.assetId}`,
        preview: { type: 'image', image: fixedImage(asset), subtitle: 'Fixed Case image' }
      });
    }
  }

  /** @type {any[]} */
  const stimulusGroups = selectedCase.stimulusGroups ?? [];
  for (const group of stimulusGroups) {
    if (!active(group.isActive)) continue;
    /** @type {any[]} */
    const options = group.options ?? [];
    const activeOptions = options.filter((option) => active(option.isActive) && active(option.assetIsActive));
    if (activeOptions.length === 0) continue;
    const setImages = activeOptions.map(optionImage);

    /** @type {any[]} */
    const groupQuestions = group.questions ?? [];
    for (const question of groupQuestions) {
      if (!active(question.isActive)) continue;
      const promptId = text(question.questionPromptId);
      push(`group:${group.id}:${promptId}`, {
        promptId,
        promptMd: text(question.promptMd),
        answerMd: text(question.answerMd),
        sourceType: 'group',
        sourceLabel: 'SET-WIDE',
        sourceName: group.name,
        editTarget: `set-wide-${group.id}`,
        preview: { type: 'set', images: setImages, subtitle: `${group.name} alternatives` }
      });
    }

    /** @type {any[]} */
    const optionQuestions = group.optionQuestions ?? [];
    for (const option of activeOptions) {
      const optionName = option.originalFilename ?? option.assetId;
      const image = optionImage(option);
      for (const question of optionQuestions) {
        if (question.stimulusGroupOptionId !== option.id || !active(question.isActive)) continue;
        const promptId = text(question.questionPromptId);
        push(`option:${option.id}:${promptId}`, {
          promptId,
          promptMd: text(question.promptMd),
          answerMd: text(question.answerMd),
          sourceType: 'option',
          sourceLabel: 'IMAGE-SPECIFIC',
          sourceName: optionName,
          editTarget: `option-review-${option.id}`,
          preview: { type: 'image', image, subtitle: `${group.name} alternative` }
        });
      }

      const reusable = reusableSummaryForContext(selectedCase, option.assetId, option.id);
      for (const question of usedReusableQuestions(reusable)) {
        const identity = text(question.id) || text(question.questionPromptId) || text(question.promptMd);
        push(`reusable:${option.id}:${identity}`, {
          promptId: text(question.questionPromptId),
          promptMd: text(question.promptMd),
          answerMd: text(question.answerMd),
          sourceType: 'reusable',
          sourceLabel: 'REUSABLE',
          sourceName: optionName,
          editTarget: `option-review-${option.id}`,
          preview: { type: 'image', image, subtitle: `${group.name} alternative` }
        });
      }
    }
  }

  return rows.map((row, index) => ({ ...row, number: index + 1 }));
}

/** @param {any} selectedCase */
export function buildCaseFastReviewSummary(selectedCase) {
  if (!selectedCase) {
    return {
      fixedImages: 0,
      alternativeSets: 0,
      alternativeImages: 0,
      caseWideQuestions: 0,
      caseSpecificImageQuestions: 0,
      reusableImageQuestionsUsed: 0,
      setWideQuestions: 0,
      allQuestions: 0
    };
  }

  /** @type {any[]} */
  const attached = selectedCase.attached ?? [];
  /** @type {any[]} */
  const stimulusGroups = selectedCase.stimulusGroups ?? [];
  /** @type {any[]} */
  const caseQuestions = selectedCase.questions ?? [];
  const activeFixed = attached.filter((asset) => active(asset.isActive));
  const activeGroups = stimulusGroups.filter((group) => active(group.isActive));
  let alternativeImages = 0;
  let caseSpecificImageQuestions = 0;
  let reusableImageQuestionsUsed = 0;
  let setWideQuestions = 0;

  for (const asset of activeFixed) {
    reusableImageQuestionsUsed += usedReusableQuestions(
      reusableSummaryForContext(selectedCase, asset.assetId, null)
    ).length;
  }

  for (const group of activeGroups) {
    /** @type {any[]} */
    const options = group.options ?? [];
    /** @type {any[]} */
    const groupQuestions = group.questions ?? [];
    /** @type {any[]} */
    const optionQuestions = group.optionQuestions ?? [];
    const activeOptions = options.filter((option) => active(option.isActive) && active(option.assetIsActive));
    alternativeImages += activeOptions.length;
    if (activeOptions.length === 0) continue;
    setWideQuestions += groupQuestions.filter((question) => active(question.isActive)).length;
    for (const option of activeOptions) {
      caseSpecificImageQuestions += optionQuestions.filter(
        (question) => question.stimulusGroupOptionId === option.id && active(question.isActive)
      ).length;
      reusableImageQuestionsUsed += usedReusableQuestions(
        reusableSummaryForContext(selectedCase, option.assetId, option.id)
      ).length;
    }
  }

  const audit = buildCaseQuestionAudit(selectedCase);
  return {
    fixedImages: activeFixed.length,
    alternativeSets: activeGroups.length,
    alternativeImages,
    caseWideQuestions: caseQuestions.filter((question) => active(question.isActive ?? true)).length,
    caseSpecificImageQuestions,
    reusableImageQuestionsUsed,
    setWideQuestions,
    allQuestions: audit.length
  };
}
