export const REVIEW_MAP_VERSION = 1;
export const REVIEW_STATUSES = ['pending', 'approved', 'needs_review', 'rejected'];
export const CONFIDENCE_VALUES = ['high', 'medium', 'low'];
export const WARNING_SEVERITIES = ['blocking', 'warning', 'info'];

// These values mirror the current production exports. The regression suite
// imports the production modules and fails if this browser-safe copy drifts.
export const PRODUCTION_LIMITS = Object.freeze({
  importPackageVersion: 1,
  maxArchiveBytes: 25 * 1024 * 1024,
  maxUncompressedBytes: 40 * 1024 * 1024,
  maxArchiveEntries: 256,
  maxManifestBytes: 2 * 1024 * 1024,
  maxImageBytes: 5 * 1024 * 1024
});

const ENTITY_COLLECTIONS = ['topics', 'cases', 'assets', 'caseAssets', 'questionPrompts', 'caseQuestions', 'topicQuestions'];
const REVIEW_TOP_KEYS = ['version', 'bundleId', 'batchName', 'sourceFiles', 'cases', 'sourceCoverage', 'unresolvedQuestions', 'batchWarnings'];
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PACKAGE_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MIME_TYPES = new Set(['image/jpeg', 'image/png']);
const OPERATIONS = new Set(['create', 'use', 'skip']);
const enc = new TextEncoder();
const dec = new TextDecoder('utf-8', { fatal: true });

export class ReviewBundleError extends Error {
  constructor(message, issues = []) {
    super(message);
    this.name = 'ReviewBundleError';
    this.issues = issues.length ? issues : [message];
  }
}

const isObject = value => typeof value === 'object' && value !== null && !Array.isArray(value);
function objectValue(value, path) {
  if (!isObject(value)) throw new ReviewBundleError(`${path} must be an object.`);
  return value;
}
function arrayValue(value, path) {
  if (!Array.isArray(value)) throw new ReviewBundleError(`${path} must be an array.`);
  return value;
}
function requiredString(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw new ReviewBundleError(`${path} must be a non-empty string.`);
  return value.trim();
}
function optionalString(value, path) {
  return value === undefined || value === null ? null : requiredString(value, path);
}
function optionalBoolean(value, path) {
  if (value === undefined) return true;
  if (typeof value !== 'boolean') throw new ReviewBundleError(`${path} must be boolean.`);
  return value;
}
function enumValue(value, choices, path) {
  const normalized = requiredString(value, path);
  if (!choices.includes(normalized)) throw new ReviewBundleError(`${path} must be one of: ${choices.join(', ')}.`);
  return normalized;
}
function allowedKeys(value, allowed, path) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new ReviewBundleError(`${path}.${key} is not supported.`);
}
function uniqueBy(items, key, path) {
  const seen = new Set();
  for (let i = 0; i < items.length; i += 1) {
    const id = requiredString(items[i][key], `${path}[${i}].${key}`);
    if (seen.has(id)) throw new ReviewBundleError(`Duplicate ${path} ${key}: ${id}.`);
    seen.add(id);
  }
  return seen;
}
function packageReference(value, path) {
  const id = requiredString(value, path);
  if (!ID_RE.test(id)) throw new ReviewBundleError(`${path} contains an invalid package-local identifier.`);
  return id;
}
function packageEntityId(value, path) {
  const id = requiredString(value, path);
  if (!ID_RE.test(id)) throw new ReviewBundleError(`${path} contains unsupported characters.`);
  return id;
}
function operation(item, path) {
  const op = requiredString(item.operation, `${path}.operation`);
  if (!OPERATIONS.has(op)) throw new ReviewBundleError(`${path}.operation must be create, use, or skip.`);
  if (op === 'create' && item.applicationId !== undefined) throw new ReviewBundleError(`${path}.applicationId is only allowed for use or skip.`);
  if ((op === 'use' || op === 'skip') && !item.applicationId) throw new ReviewBundleError(`${path}.applicationId is required for ${op}.`);
  if (item.applicationId !== undefined) requiredString(item.applicationId, `${path}.applicationId`);
  return op;
}
function warning(value, path) {
  const item = objectValue(value, path);
  allowedKeys(item, ['code', 'severity', 'message'], path);
  return {
    code: requiredString(item.code, `${path}.code`),
    severity: enumValue(item.severity, WARNING_SEVERITIES, `${path}.severity`),
    message: requiredString(item.message, `${path}.message`)
  };
}
function sourceRef(value, path) {
  const item = objectValue(value, path);
  allowedKeys(item, ['sourceId', 'pages'], path);
  const pages = arrayValue(item.pages, `${path}.pages`).map((page, i) => {
    if (!Number.isInteger(page) || page < 1) throw new ReviewBundleError(`${path}.pages[${i}] must be a positive integer.`);
    return page;
  });
  return { sourceId: requiredString(item.sourceId, `${path}.sourceId`), pages };
}
function warnings(value, path) {
  return arrayValue(value ?? [], path).map((item, i) => warning(item, `${path}[${i}]`));
}
function sourceRefs(value, path) {
  return arrayValue(value ?? [], path).map((item, i) => sourceRef(item, `${path}[${i}]`));
}
function reviewNotes(value, path) {
  return arrayValue(value ?? [], path).map((item, i) => requiredString(item, `${path}[${i}]`));
}
function hasBlocking(items = []) {
  return items.some(item => item.severity === 'blocking');
}

function parseAssetReview(value, path, manifestAssetIds) {
  const item = objectValue(value, path);
  allowedKeys(item, ['assetId', 'reviewStatus', 'confidence', 'warnings', 'sourceRefs', 'extractionMethod', 'sha256', 'reviewNotes'], path);
  const assetId = requiredString(item.assetId, `${path}.assetId`);
  if (!manifestAssetIds.has(assetId)) throw new ReviewBundleError(`${path}.assetId references missing manifest Asset ${assetId}.`);
  return {
    assetId,
    reviewStatus: enumValue(item.reviewStatus, REVIEW_STATUSES, `${path}.reviewStatus`),
    confidence: enumValue(item.confidence, CONFIDENCE_VALUES, `${path}.confidence`),
    warnings: warnings(item.warnings, `${path}.warnings`),
    sourceRefs: sourceRefs(item.sourceRefs, `${path}.sourceRefs`),
    extractionMethod: optionalString(item.extractionMethod, `${path}.extractionMethod`),
    sha256: optionalString(item.sha256, `${path}.sha256`),
    reviewNotes: reviewNotes(item.reviewNotes, `${path}.reviewNotes`)
  };
}
function parseQuestionReview(value, path, manifestQuestionIds) {
  const item = objectValue(value, path);
  allowedKeys(item, ['caseQuestionId', 'reviewStatus', 'confidence', 'warnings', 'promptSourceRefs', 'answerSourceRefs', 'reviewNotes'], path);
  const caseQuestionId = requiredString(item.caseQuestionId, `${path}.caseQuestionId`);
  if (!manifestQuestionIds.has(caseQuestionId)) throw new ReviewBundleError(`${path}.caseQuestionId references missing manifest Case Question ${caseQuestionId}.`);
  return {
    caseQuestionId,
    reviewStatus: enumValue(item.reviewStatus, REVIEW_STATUSES, `${path}.reviewStatus`),
    confidence: enumValue(item.confidence, CONFIDENCE_VALUES, `${path}.confidence`),
    warnings: warnings(item.warnings, `${path}.warnings`),
    promptSourceRefs: sourceRefs(item.promptSourceRefs, `${path}.promptSourceRefs`),
    answerSourceRefs: sourceRefs(item.answerSourceRefs, `${path}.answerSourceRefs`),
    reviewNotes: reviewNotes(item.reviewNotes, `${path}.reviewNotes`)
  };
}

export function validateReviewMap(input, manifest, bundlePaths = new Set()) {
  const root = objectValue(input, 'reviewMap');
  allowedKeys(root, REVIEW_TOP_KEYS, 'reviewMap');
  if (root.version !== REVIEW_MAP_VERSION) throw new ReviewBundleError(`Unsupported review-map version: ${String(root.version)}.`);

  const sourceFiles = arrayValue(root.sourceFiles, 'reviewMap.sourceFiles').map((value, i) => {
    const path = `reviewMap.sourceFiles[${i}]`;
    const item = objectValue(value, path);
    allowedKeys(item, ['sourceId', 'filename', 'repository', 'path', 'ref', 'pageCount'], path);
    if (!Number.isInteger(item.pageCount) || item.pageCount < 1) throw new ReviewBundleError(`${path}.pageCount must be a positive integer.`);
    return {
      sourceId: requiredString(item.sourceId, `${path}.sourceId`),
      filename: requiredString(item.filename, `${path}.filename`),
      repository: optionalString(item.repository, `${path}.repository`),
      path: optionalString(item.path, `${path}.path`),
      ref: optionalString(item.ref, `${path}.ref`),
      pageCount: item.pageCount
    };
  });
  const sourceIds = uniqueBy(sourceFiles, 'sourceId', 'reviewMap.sourceFiles');
  const manifestCaseIds = new Set(manifest.cases.map(item => item.id));
  const manifestAssetIds = new Set(manifest.assets.map(item => item.id));
  const manifestQuestionIds = new Set(manifest.caseQuestions.map(item => item.id));
  const manifestPromptIds = new Set(manifest.questionPrompts.map(item => item.id));

  const cases = arrayValue(root.cases, 'reviewMap.cases').map((value, i) => {
    const path = `reviewMap.cases[${i}]`;
    const item = objectValue(value, path);
    allowedKeys(item, ['caseId', 'reviewStatus', 'confidence', 'warnings', 'sourceRefs', 'caseBoundaryNotes', 'assets', 'questions', 'reviewNotes'], path);
    const caseId = requiredString(item.caseId, `${path}.caseId`);
    if (!manifestCaseIds.has(caseId)) throw new ReviewBundleError(`${path}.caseId references missing manifest Case ${caseId}.`);
    const assets = arrayValue(item.assets ?? [], `${path}.assets`).map((child, j) => parseAssetReview(child, `${path}.assets[${j}]`, manifestAssetIds));
    const questions = arrayValue(item.questions ?? [], `${path}.questions`).map((child, j) => parseQuestionReview(child, `${path}.questions[${j}]`, manifestQuestionIds));
    uniqueBy(assets, 'assetId', `${path}.assets`);
    uniqueBy(questions, 'caseQuestionId', `${path}.questions`);
    return {
      caseId,
      reviewStatus: enumValue(item.reviewStatus, REVIEW_STATUSES, `${path}.reviewStatus`),
      confidence: enumValue(item.confidence, CONFIDENCE_VALUES, `${path}.confidence`),
      warnings: warnings(item.warnings, `${path}.warnings`),
      sourceRefs: sourceRefs(item.sourceRefs, `${path}.sourceRefs`),
      caseBoundaryNotes: optionalString(item.caseBoundaryNotes, `${path}.caseBoundaryNotes`),
      assets,
      questions,
      reviewNotes: reviewNotes(item.reviewNotes, `${path}.reviewNotes`)
    };
  });
  uniqueBy(cases, 'caseId', 'reviewMap.cases');

  const unresolvedQuestions = arrayValue(root.unresolvedQuestions, 'reviewMap.unresolvedQuestions').map((value, i) => {
    const path = `reviewMap.unresolvedQuestions[${i}]`;
    const item = objectValue(value, path);
    allowedKeys(item, ['candidateId', 'caseId', 'sourcePrompt', 'proposedPrompt', 'promptSourceRefs', 'answerSourceRefs', 'reviewStatus', 'confidence', 'warnings', 'reviewNotes', 'resolvedQuestionPromptId', 'resolvedCaseQuestionId'], path);
    const caseId = requiredString(item.caseId, `${path}.caseId`);
    if (!manifestCaseIds.has(caseId)) throw new ReviewBundleError(`${path}.caseId references missing manifest Case ${caseId}.`);
    const resolvedQuestionPromptId = optionalString(item.resolvedQuestionPromptId, `${path}.resolvedQuestionPromptId`);
    const resolvedCaseQuestionId = optionalString(item.resolvedCaseQuestionId, `${path}.resolvedCaseQuestionId`);
    if (Boolean(resolvedQuestionPromptId) !== Boolean(resolvedCaseQuestionId)) throw new ReviewBundleError(`${path} must point to both resolved manifest IDs or neither.`);
    if (resolvedQuestionPromptId && !manifestPromptIds.has(resolvedQuestionPromptId)) throw new ReviewBundleError(`${path}.resolvedQuestionPromptId references a missing manifest Question Prompt.`);
    if (resolvedCaseQuestionId && !manifestQuestionIds.has(resolvedCaseQuestionId)) throw new ReviewBundleError(`${path}.resolvedCaseQuestionId references a missing manifest Case Question.`);
    return {
      candidateId: requiredString(item.candidateId, `${path}.candidateId`),
      caseId,
      sourcePrompt: optionalString(item.sourcePrompt, `${path}.sourcePrompt`),
      proposedPrompt: requiredString(item.proposedPrompt, `${path}.proposedPrompt`),
      promptSourceRefs: sourceRefs(item.promptSourceRefs, `${path}.promptSourceRefs`),
      answerSourceRefs: sourceRefs(item.answerSourceRefs, `${path}.answerSourceRefs`),
      reviewStatus: enumValue(item.reviewStatus, REVIEW_STATUSES, `${path}.reviewStatus`),
      confidence: enumValue(item.confidence, CONFIDENCE_VALUES, `${path}.confidence`),
      warnings: warnings(item.warnings, `${path}.warnings`),
      reviewNotes: reviewNotes(item.reviewNotes, `${path}.reviewNotes`),
      resolvedQuestionPromptId,
      resolvedCaseQuestionId
    };
  });
  uniqueBy(unresolvedQuestions, 'candidateId', 'reviewMap.unresolvedQuestions');

  const sourceCoverage = arrayValue(root.sourceCoverage, 'reviewMap.sourceCoverage').map((value, i) => {
    const path = `reviewMap.sourceCoverage[${i}]`;
    const item = objectValue(value, path);
    allowedKeys(item, ['sourceId', 'page', 'classification', 'caseIds', 'notes', 'previewPath'], path);
    const sourceId = requiredString(item.sourceId, `${path}.sourceId`);
    if (!sourceIds.has(sourceId)) throw new ReviewBundleError(`${path}.sourceId references missing source ${sourceId}.`);
    if (!Number.isInteger(item.page) || item.page < 1) throw new ReviewBundleError(`${path}.page must be a positive integer.`);
    const caseIds = arrayValue(item.caseIds ?? [], `${path}.caseIds`).map((id, j) => requiredString(id, `${path}.caseIds[${j}]`));
    for (const id of caseIds) if (!manifestCaseIds.has(id)) throw new ReviewBundleError(`${path}.caseIds references missing manifest Case ${id}.`);
    const previewPath = optionalString(item.previewPath, `${path}.previewPath`);
    if (previewPath && bundlePaths.size && !bundlePaths.has(previewPath)) throw new ReviewBundleError(`${path}.previewPath references missing bundle file ${previewPath}.`);
    return { sourceId, page: item.page, classification: requiredString(item.classification, `${path}.classification`), caseIds, notes: optionalString(item.notes, `${path}.notes`), previewPath };
  });
  const coverageKeys = new Set();
  for (const item of sourceCoverage) {
    const key = `${item.sourceId}:${item.page}`;
    if (coverageKeys.has(key)) throw new ReviewBundleError(`Duplicate source coverage entry: ${key}.`);
    coverageKeys.add(key);
  }

  const result = {
    version: 1,
    bundleId: requiredString(root.bundleId, 'reviewMap.bundleId'),
    batchName: requiredString(root.batchName, 'reviewMap.batchName'),
    sourceFiles,
    cases,
    sourceCoverage,
    unresolvedQuestions,
    batchWarnings: warnings(root.batchWarnings, 'reviewMap.batchWarnings')
  };

  const allRefs = [];
  for (const item of cases) {
    allRefs.push(...item.sourceRefs);
    for (const asset of item.assets) allRefs.push(...asset.sourceRefs);
    for (const question of item.questions) allRefs.push(...question.promptSourceRefs, ...question.answerSourceRefs);
  }
  for (const item of unresolvedQuestions) allRefs.push(...item.promptSourceRefs, ...item.answerSourceRefs);
  for (const ref of allRefs) if (!sourceIds.has(ref.sourceId)) throw new ReviewBundleError(`Source reference points to missing source ${ref.sourceId}.`);
  return result;
}

function assertProductionMediaPath(path) {
  if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) throw new ReviewBundleError(`Unsafe media path: ${path}.`);
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..') || !path.startsWith('media/')) throw new ReviewBundleError(`Asset media path must be under media/: ${path}.`);
}
function parseProductionTopic(item, path) {
  allowedKeys(item, ['id', 'operation', 'applicationId', 'name', 'slug', 'descriptionMd', 'parentTopicId', 'isActive'], path);
  const op = operation(item, path);
  if (op === 'create') { requiredString(item.name, `${path}.name`); requiredString(item.slug, `${path}.slug`); }
  return { ...item, id: packageEntityId(item.id, `${path}.id`), operation: op, parentTopicId: item.parentTopicId == null ? null : packageReference(item.parentTopicId, `${path}.parentTopicId`) };
}
function parseProductionCase(item, path) {
  allowedKeys(item, ['id', 'operation', 'applicationId', 'title', 'vignetteMd', 'primaryTopicId', 'secondaryTopicIds', 'questionSelectionMode', 'questionCount', 'isActive'], path);
  const op = operation(item, path);
  const secondary = item.secondaryTopicIds === undefined ? [] : item.secondaryTopicIds;
  if (!Array.isArray(secondary)) throw new ReviewBundleError(`${path}.secondaryTopicIds must be an array.`);
  const secondaryTopicIds = secondary.map((id, i) => packageReference(id, `${path}.secondaryTopicIds[${i}]`));
  const primaryTopicId = item.primaryTopicId === undefined || item.primaryTopicId === null ? null : packageReference(item.primaryTopicId, `${path}.primaryTopicId`);
  if (op === 'create' && (!primaryTopicId || typeof item.title !== 'string' || !item.title.trim())) throw new ReviewBundleError(`${path} create entries require title and exactly one primaryTopicId.`);
  if (primaryTopicId && secondaryTopicIds.includes(primaryTopicId)) throw new ReviewBundleError(`${path} cannot use the primary Topic as a secondary Topic.`);
  if (new Set(secondaryTopicIds).size !== secondaryTopicIds.length) throw new ReviewBundleError(`${path}.secondaryTopicIds contains a duplicate Topic.`);
  const mode = item.questionSelectionMode === undefined ? 'automatic' : requiredString(item.questionSelectionMode, `${path}.questionSelectionMode`);
  if (!['automatic', 'all', 'fixed'].includes(mode)) throw new ReviewBundleError(`${path}.questionSelectionMode is invalid.`);
  const count = item.questionCount === undefined || item.questionCount === null ? null : Number(item.questionCount);
  if (mode === 'fixed' && (count === null || !Number.isInteger(count) || count < 1)) throw new ReviewBundleError(`${path}.questionCount must be a positive integer for fixed selection.`);
  if (mode !== 'fixed' && count !== null) throw new ReviewBundleError(`${path}.questionCount is only allowed with fixed selection.`);
  return { ...item, id: packageEntityId(item.id, `${path}.id`), operation: op, primaryTopicId, secondaryTopicIds, questionSelectionMode: mode, questionCount: count };
}
function parseProductionAsset(item, path) {
  allowedKeys(item, ['id', 'operation', 'applicationId', 'path', 'mimeType', 'originalFilename', 'altText', 'sourceLabel', 'sourceUrl', 'licence', 'isActive'], path);
  const op = operation(item, path);
  const mediaPath = item.path === undefined ? null : requiredString(item.path, `${path}.path`);
  const mimeType = item.mimeType === undefined ? null : requiredString(item.mimeType, `${path}.mimeType`);
  if (mimeType && !MIME_TYPES.has(mimeType)) throw new ReviewBundleError(`${path}.mimeType must be image/jpeg or image/png.`);
  if (op === 'create') {
    if (!mediaPath || !mimeType) throw new ReviewBundleError(`${path} create entries require path and mimeType.`);
    requiredString(item.altText, `${path}.altText`);
    assertProductionMediaPath(mediaPath);
  } else if (mediaPath) throw new ReviewBundleError(`${path}.path is only allowed for create entries.`);
  if (item.sourceUrl !== undefined && item.sourceUrl !== null) {
    let url;
    try { url = new URL(requiredString(item.sourceUrl, `${path}.sourceUrl`)); } catch { throw new ReviewBundleError(`${path}.sourceUrl must be a valid http(s) URL.`); }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new ReviewBundleError(`${path}.sourceUrl must be a valid http(s) URL.`);
  }
  return { ...item, id: packageEntityId(item.id, `${path}.id`), operation: op, path: mediaPath, mimeType };
}
function parseProductionPrompt(item, path) {
  allowedKeys(item, ['id', 'operation', 'applicationId', 'promptMd', 'isActive'], path);
  const op = operation(item, path);
  if (op === 'create') requiredString(item.promptMd, `${path}.promptMd`);
  return { ...item, id: packageEntityId(item.id, `${path}.id`), operation: op };
}
function parseProductionQuestion(item, path, kind) {
  const ownerKey = kind === 'case' ? 'caseId' : 'topicId';
  allowedKeys(item, ['id', 'operation', 'applicationId', ownerKey, 'questionPromptId', 'answerMd', 'inheritToDescendants', 'isActive'], path);
  const op = operation(item, path);
  packageReference(item[ownerKey], `${path}.${ownerKey}`);
  packageReference(item.questionPromptId, `${path}.questionPromptId`);
  if (op === 'create') requiredString(item.answerMd, `${path}.answerMd`);
  if (kind === 'topic' && item.inheritToDescendants !== undefined && typeof item.inheritToDescendants !== 'boolean') throw new ReviewBundleError(`${path}.inheritToDescendants must be boolean.`);
  return { ...item, id: packageEntityId(item.id, `${path}.id`), operation: op };
}
function parseProductionCaseAsset(item, path) {
  allowedKeys(item, ['id', 'operation', 'applicationId', 'caseId', 'assetId', 'displayOrder', 'captionMd'], path);
  const op = operation(item, path);
  packageReference(item.caseId, `${path}.caseId`);
  packageReference(item.assetId, `${path}.assetId`);
  const displayOrder = Number(item.displayOrder);
  if (!Number.isInteger(displayOrder) || displayOrder < 0) throw new ReviewBundleError(`${path}.displayOrder must be a non-negative integer.`);
  return { ...item, id: packageEntityId(item.id, `${path}.id`), operation: op, displayOrder };
}

export function validateProductionManifest(input) {
  const root = objectValue(input, 'manifest');
  allowedKeys(root, ['version', 'packageId', ...ENTITY_COLLECTIONS], 'manifest');
  if (root.version !== PRODUCTION_LIMITS.importPackageVersion) throw new ReviewBundleError(`Unsupported import manifest version: ${String(root.version)}.`);
  const packageId = requiredString(root.packageId, 'manifest.packageId');
  if (!PACKAGE_ID_RE.test(packageId)) throw new ReviewBundleError('manifest.packageId contains unsupported characters.');
  const parsed = { version: 1, packageId, topics: [], cases: [], assets: [], caseAssets: [], questionPrompts: [], caseQuestions: [], topicQuestions: [] };
  for (const collection of ENTITY_COLLECTIONS) {
    const entries = arrayValue(root[collection], `manifest.${collection}`);
    parsed[collection] = entries.map((value, i) => {
      const path = `manifest.${collection}[${i}]`;
      const item = objectValue(value, path);
      if (collection === 'topics') return parseProductionTopic(item, path);
      if (collection === 'cases') return parseProductionCase(item, path);
      if (collection === 'assets') return parseProductionAsset(item, path);
      if (collection === 'caseAssets') return parseProductionCaseAsset(item, path);
      if (collection === 'questionPrompts') return parseProductionPrompt(item, path);
      return parseProductionQuestion(item, path, collection === 'caseQuestions' ? 'case' : 'topic');
    });
  }
  const ids = new Set();
  for (const collection of ENTITY_COLLECTIONS) for (const item of parsed[collection]) {
    if (ids.has(item.id)) throw new ReviewBundleError(`Duplicate package-local identifier: ${item.id}.`);
    ids.add(item.id);
  }
  return parsed;
}

function referentialIssues(manifest) {
  const issues = [];
  const topicIds = new Set(manifest.topics.map(item => item.id));
  const caseIds = new Set(manifest.cases.map(item => item.id));
  const assetIds = new Set(manifest.assets.map(item => item.id));
  const promptIds = new Set(manifest.questionPrompts.map(item => item.id));
  for (const topic of manifest.topics) if (topic.parentTopicId && !topicIds.has(topic.parentTopicId)) issues.push(`Topic ${topic.id} references missing parent Topic ${topic.parentTopicId}.`);
  for (const item of manifest.cases) {
    if (item.primaryTopicId && !topicIds.has(item.primaryTopicId)) issues.push(`Case ${item.id} references missing Topic ${item.primaryTopicId}.`);
    for (const id of item.secondaryTopicIds ?? []) if (!topicIds.has(id)) issues.push(`Case ${item.id} references missing secondary Topic ${id}.`);
  }
  for (const item of manifest.caseAssets) {
    if (!caseIds.has(item.caseId)) issues.push(`Case Asset ${item.id} references missing Case ${item.caseId}.`);
    if (!assetIds.has(item.assetId)) issues.push(`Case Asset ${item.id} references missing Asset ${item.assetId}.`);
  }
  for (const item of manifest.caseQuestions) {
    if (!caseIds.has(item.caseId)) issues.push(`Case Question ${item.id} references missing Case ${item.caseId}.`);
    if (!promptIds.has(item.questionPromptId)) issues.push(`Case Question ${item.id} references missing Question Prompt ${item.questionPromptId}.`);
  }
  for (const item of manifest.topicQuestions) {
    if (!topicIds.has(item.topicId)) issues.push(`Topic Question ${item.id} references missing Topic ${item.topicId}.`);
    if (!promptIds.has(item.questionPromptId)) issues.push(`Topic Question ${item.id} references missing Question Prompt ${item.questionPromptId}.`);
  }
  return issues;
}

export function deterministicResolvedIds(candidateId) {
  const safe = requiredString(candidateId, 'candidateId').replace(/[^A-Za-z0-9._:-]/g, '-');
  return { questionPromptId: `resolved-prompt:${safe}`, caseQuestionId: `resolved-case-question:${safe}` };
}
export function resolveUnresolvedQuestion(manifest, reviewMap, candidateId, { promptMd, answerMd }) {
  const candidate = reviewMap.unresolvedQuestions.find(item => item.candidateId === candidateId);
  if (!candidate) throw new ReviewBundleError(`Unknown unresolved Question ${candidateId}.`);
  if (candidate.resolvedQuestionPromptId || candidate.resolvedCaseQuestionId) throw new ReviewBundleError(`Unresolved Question ${candidateId} has already been promoted.`);
  const prompt = requiredString(promptMd, 'promptMd');
  const answer = requiredString(answerMd, 'answerMd');
  const ids = deterministicResolvedIds(candidateId);
  const everyId = new Set(ENTITY_COLLECTIONS.flatMap(collection => manifest[collection].map(item => item.id)));
  if (everyId.has(ids.questionPromptId) || everyId.has(ids.caseQuestionId)) throw new ReviewBundleError(`Deterministic IDs for ${candidateId} already exist.`);
  manifest.questionPrompts.push({ id: ids.questionPromptId, operation: 'create', promptMd: prompt, isActive: true });
  manifest.caseQuestions.push({ id: ids.caseQuestionId, operation: 'create', caseId: candidate.caseId, questionPromptId: ids.questionPromptId, answerMd: answer, isActive: true });
  const caseReview = reviewMap.cases.find(item => item.caseId === candidate.caseId);
  if (!caseReview) throw new ReviewBundleError(`Missing review Case ${candidate.caseId}.`);
  caseReview.questions.push({
    caseQuestionId: ids.caseQuestionId,
    reviewStatus: 'pending',
    confidence: candidate.confidence,
    warnings: [],
    promptSourceRefs: structuredClone(candidate.promptSourceRefs),
    answerSourceRefs: structuredClone(candidate.answerSourceRefs),
    reviewNotes: []
  });
  candidate.reviewStatus = 'approved';
  candidate.resolvedQuestionPromptId = ids.questionPromptId;
  candidate.resolvedCaseQuestionId = ids.caseQuestionId;
  candidate.warnings = candidate.warnings.filter(item => item.code !== 'missing_answer');
  return ids;
}
export function rejectUnresolvedQuestion(reviewMap, candidateId) {
  const candidate = reviewMap.unresolvedQuestions.find(item => item.candidateId === candidateId);
  if (!candidate) throw new ReviewBundleError(`Unknown unresolved Question ${candidateId}.`);
  if (candidate.resolvedQuestionPromptId || candidate.resolvedCaseQuestionId) throw new ReviewBundleError(`Promoted unresolved Question ${candidateId} cannot be rejected without explicitly editing the manifest.`);
  candidate.reviewStatus = 'rejected';
}

export function detectImageType(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return 'image/jpeg';
  return null;
}
export async function sha256Hex(bytes) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

function u16(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8); }
function u32(bytes, offset) { return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; }
function safeReviewZipPath(path) {
  if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path) || path.split('/').some(part => !part || part === '.' || part === '..')) throw new ReviewBundleError(`Unsafe ZIP path: ${path}.`);
}
function endOfCentralDirectory(bytes) {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) if (u32(bytes, offset) === 0x06054b50) return offset;
  throw new ReviewBundleError('ZIP end-of-central-directory record is missing.');
}
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new ReviewBundleError('This runtime cannot decompress deflated ZIP entries.');
  const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
export async function readZip(input) {
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(await input.arrayBuffer());
  const eocd = endOfCentralDirectory(bytes);
  const disk = u16(bytes, eocd + 4), centralDisk = u16(bytes, eocd + 6), entriesOnDisk = u16(bytes, eocd + 8), count = u16(bytes, eocd + 10);
  if (disk !== 0 || centralDisk !== 0 || entriesOnDisk !== count) throw new ReviewBundleError('Multi-disk ZIP archives are not supported.');
  if (count > 4096) throw new ReviewBundleError('Review ZIP contains too many entries.');
  const centralSize = u32(bytes, eocd + 12), centralOffset = u32(bytes, eocd + 16), commentLength = u16(bytes, eocd + 20);
  if (eocd + 22 + commentLength !== bytes.length || centralOffset + centralSize !== eocd) throw new ReviewBundleError('ZIP central directory length is inconsistent.');
  const files = new Map();
  let cursor = centralOffset;
  for (let i = 0; i < count; i += 1) {
    if (u32(bytes, cursor) !== 0x02014b50) throw new ReviewBundleError('ZIP central directory entry is invalid.');
    const flags = u16(bytes, cursor + 8), method = u16(bytes, cursor + 10), compressed = u32(bytes, cursor + 20), uncompressed = u32(bytes, cursor + 24);
    const nameLen = u16(bytes, cursor + 28), extraLen = u16(bytes, cursor + 30), commentLen = u16(bytes, cursor + 32), localOffset = u32(bytes, cursor + 42);
    const path = dec.decode(bytes.slice(cursor + 46, cursor + 46 + nameLen));
    safeReviewZipPath(path);
    if (files.has(path)) throw new ReviewBundleError(`Duplicate ZIP entry: ${path}.`);
    if (flags & 1) throw new ReviewBundleError(`Encrypted ZIP entry is not supported: ${path}.`);
    if (method !== 0 && method !== 8) throw new ReviewBundleError(`ZIP compression method ${method} is not supported.`);
    if (u32(bytes, localOffset) !== 0x04034b50) throw new ReviewBundleError(`Invalid local ZIP header for ${path}.`);
    const localNameLen = u16(bytes, localOffset + 26), localExtraLen = u16(bytes, localOffset + 28);
    const localPath = dec.decode(bytes.slice(localOffset + 30, localOffset + 30 + localNameLen));
    if (localPath !== path) throw new ReviewBundleError(`ZIP local and central filenames differ for ${path}.`);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const compressedBytes = bytes.slice(dataStart, dataStart + compressed);
    const data = method === 0 ? compressedBytes : await inflateRaw(compressedBytes);
    if (data.byteLength !== uncompressed) throw new ReviewBundleError(`ZIP entry size mismatch: ${path}.`);
    files.set(path, data);
    cursor += 46 + nameLen + extraLen + commentLen;
  }
  if (cursor !== eocd) throw new ReviewBundleError('ZIP central directory length is inconsistent.');
  return files;
}

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function push16(out, value) { out.push(value & 255, (value >>> 8) & 255); }
function push32(out, value) { out.push(value & 255, (value >>> 8) & 255, (value >>> 16) & 255, (value >>> 24) & 255); }
export function writeStoredZip(entries) {
  if (entries.length > 0xffff) throw new ReviewBundleError('ZIP64 output is not supported.');
  const local = [], central = [];
  const seen = new Set();
  let offset = 0;
  for (const entry of entries) {
    safeReviewZipPath(entry.path);
    if (seen.has(entry.path)) throw new ReviewBundleError(`Duplicate ZIP entry: ${entry.path}.`);
    seen.add(entry.path);
    const name = enc.encode(entry.path), data = entry.bytes instanceof Uint8Array ? entry.bytes : new Uint8Array(entry.bytes), crc = crc32(data);
    const lh = []; push32(lh, 0x04034b50); push16(lh, 20); push16(lh, 0); push16(lh, 0); push16(lh, 0); push16(lh, 0); push32(lh, crc); push32(lh, data.length); push32(lh, data.length); push16(lh, name.length); push16(lh, 0);
    local.push(new Uint8Array(lh), name, data);
    const ch = []; push32(ch, 0x02014b50); push16(ch, 20); push16(ch, 20); push16(ch, 0); push16(ch, 0); push16(ch, 0); push16(ch, 0); push32(ch, crc); push32(ch, data.length); push32(ch, data.length); push16(ch, name.length); push16(ch, 0); push16(ch, 0); push16(ch, 0); push16(ch, 0); push32(ch, 0); push32(ch, offset);
    central.push(new Uint8Array(ch), name);
    offset += lh.length + name.length + data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = []; push32(end, 0x06054b50); push16(end, 0); push16(end, 0); push16(end, entries.length); push16(end, entries.length); push32(end, centralSize); push32(end, offset); push16(end, 0);
  const chunks = [...local, ...central, new Uint8Array(end)], size = chunks.reduce((sum, item) => sum + item.length, 0), result = new Uint8Array(size);
  let cursor = 0;
  for (const chunk of chunks) { result.set(chunk, cursor); cursor += chunk.length; }
  return result;
}
function parseJsonFile(files, path) {
  const bytes = files.get(path);
  if (!bytes) throw new ReviewBundleError(`Review bundle is missing ${path}.`);
  try { return JSON.parse(dec.decode(bytes)); } catch { throw new ReviewBundleError(`${path} is malformed JSON.`); }
}
export async function loadReviewBundle(input) {
  const files = await readZip(input);
  if (!files.has('manifest.json') || !files.has('review-map.json')) throw new ReviewBundleError('Review ZIP must contain manifest.json and review-map.json.');
  for (const path of files.keys()) if (path !== 'manifest.json' && path !== 'review-map.json' && !path.startsWith('media/') && !path.startsWith('source-previews/')) throw new ReviewBundleError(`Unexpected review ZIP path: ${path}.`);
  const manifest = parseJsonFile(files, 'manifest.json');
  // Parse the manifest using the production-shaped browser-safe validator. This
  // intentionally does not change or weaken the server validator.
  validateProductionManifest(manifest);
  const declaredOriginalMedia = new Set(manifest.assets.filter(item => item.operation === 'create').map(item => item.path));
  for (const path of files.keys()) if (path.startsWith('media/') && !declaredOriginalMedia.has(path)) throw new ReviewBundleError(`Review bundle contains undeclared media: ${path}.`);
  const reviewMap = validateReviewMap(parseJsonFile(files, 'review-map.json'), manifest, new Set(files.keys()));
  return { manifest, reviewMap, files };
}

export function readinessErrors(manifest, reviewMap) {
  const errors = [];
  const caseReviews = new Map(reviewMap.cases.map(item => [item.caseId, item]));
  for (const item of reviewMap.batchWarnings) if (item.severity === 'blocking') errors.push(`Batch: ${item.message}`);
  for (const candidate of reviewMap.unresolvedQuestions) {
    if (!['approved', 'rejected'].includes(candidate.reviewStatus)) errors.push(`Unresolved Question ${candidate.candidateId}: status ${candidate.reviewStatus}.`);
    if (candidate.reviewStatus === 'approved' && (!candidate.resolvedQuestionPromptId || !candidate.resolvedCaseQuestionId)) errors.push(`Unresolved Question ${candidate.candidateId}: approved without promotion into manifest.`);
  }
  for (const item of manifest.cases) {
    const meta = caseReviews.get(item.id);
    if (!meta) { errors.push(`Case ${item.id}: missing review metadata.`); continue; }
    if (!['approved', 'rejected'].includes(meta.reviewStatus)) { errors.push(`Case ${item.id}: review state is ${meta.reviewStatus}.`); continue; }
    if (meta.reviewStatus === 'rejected') continue;
    if (!String(item.title ?? '').trim()) errors.push(`Case ${item.id}: approved Case has no title.`);
    if (!String(item.primaryTopicId ?? '').trim()) errors.push(`Case ${item.id}: approved Case has no primary Topic.`);
    if (hasBlocking(meta.warnings)) for (const warning of meta.warnings.filter(w => w.severity === 'blocking')) errors.push(`Case ${item.id}: ${warning.message}`);
    const linkedAssets = manifest.caseAssets.filter(rel => rel.caseId === item.id);
    for (const rel of linkedAssets) {
      const assetMeta = meta.assets.find(child => child.assetId === rel.assetId);
      if (!assetMeta) errors.push(`Case ${item.id} Asset ${rel.assetId}: missing review metadata.`);
      else {
        if (assetMeta.reviewStatus !== 'approved') errors.push(`Case ${item.id} Asset ${rel.assetId}: status ${assetMeta.reviewStatus}.`);
        for (const warning of assetMeta.warnings.filter(w => w.severity === 'blocking')) errors.push(`Asset ${rel.assetId}: ${warning.message}`);
      }
    }
    const linkedQuestions = manifest.caseQuestions.filter(rel => rel.caseId === item.id);
    for (const rel of linkedQuestions) {
      const questionMeta = meta.questions.find(child => child.caseQuestionId === rel.id);
      if (!questionMeta) errors.push(`Case ${item.id} Question ${rel.id}: missing review metadata.`);
      else {
        if (questionMeta.reviewStatus !== 'approved') errors.push(`Case ${item.id} Question ${rel.id}: status ${questionMeta.reviewStatus}.`);
        for (const warning of questionMeta.warnings.filter(w => w.severity === 'blocking')) errors.push(`Question ${rel.id}: ${warning.message}`);
      }
    }
  }
  return errors;
}

export function selectProductionManifest(manifest, reviewMap) {
  const approvedCaseIds = new Set(reviewMap.cases.filter(item => item.reviewStatus === 'approved').map(item => item.caseId));
  const cases = manifest.cases.filter(item => approvedCaseIds.has(item.id));
  const caseAssets = manifest.caseAssets.filter(item => approvedCaseIds.has(item.caseId));
  const assetIds = new Set(caseAssets.map(item => item.assetId));
  const caseQuestions = manifest.caseQuestions.filter(item => approvedCaseIds.has(item.caseId));
  const promptIds = new Set(caseQuestions.map(item => item.questionPromptId));
  const topicIds = new Set();
  for (const item of cases) { if (item.primaryTopicId) topicIds.add(item.primaryTopicId); for (const id of item.secondaryTopicIds ?? []) topicIds.add(id); }
  let changed = true;
  while (changed) {
    changed = false;
    for (const topic of manifest.topics) if (topicIds.has(topic.id) && topic.parentTopicId && !topicIds.has(topic.parentTopicId)) { topicIds.add(topic.parentTopicId); changed = true; }
  }
  return {
    version: manifest.version,
    packageId: manifest.packageId,
    topics: manifest.topics.filter(item => topicIds.has(item.id)),
    cases,
    assets: manifest.assets.filter(item => assetIds.has(item.id)),
    caseAssets,
    questionPrompts: manifest.questionPrompts.filter(item => promptIds.has(item.id)),
    caseQuestions,
    topicQuestions: []
  };
}

async function validateSelectedMedia(manifest, reviewMap, files) {
  const errors = [];
  const reviewAssets = new Map();
  for (const item of reviewMap.cases) for (const asset of item.assets) reviewAssets.set(asset.assetId, asset);
  const declared = new Set();
  for (const asset of manifest.assets) {
    if (asset.operation !== 'create') continue;
    if (declared.has(asset.path)) errors.push(`Media path declared more than once: ${asset.path}.`);
    declared.add(asset.path);
    const bytes = files.get(asset.path);
    if (!bytes) { errors.push(`Asset ${asset.id}: missing media ${asset.path}.`); continue; }
    if (bytes.byteLength > PRODUCTION_LIMITS.maxImageBytes) errors.push(`Asset ${asset.id}: image exceeds ${PRODUCTION_LIMITS.maxImageBytes}-byte limit.`);
    const actual = detectImageType(bytes);
    if (!actual) errors.push(`Asset ${asset.id}: unsupported image format.`);
    else if (actual !== asset.mimeType) errors.push(`Asset ${asset.id}: MIME mismatch (${asset.mimeType} vs ${actual}).`);
    if (!String(asset.altText ?? '').trim()) errors.push(`Asset ${asset.id}: alt text is blank.`);
    const meta = reviewAssets.get(asset.id);
    if (!meta) errors.push(`Asset ${asset.id}: missing review metadata.`);
    else {
      if (meta.reviewStatus !== 'approved') errors.push(`Asset ${asset.id}: review status is ${meta.reviewStatus}.`);
      if (!meta.sha256) errors.push(`Asset ${asset.id}: SHA-256 is missing from review metadata.`);
      else if ((await sha256Hex(bytes)).toLowerCase() !== meta.sha256.toLowerCase()) errors.push(`Asset ${asset.id}: SHA-256 mismatch.`);
    }
  }
  return errors;
}

export async function finalizeBundle(bundle) {
  const errors = readinessErrors(bundle.manifest, bundle.reviewMap);
  const selected = selectProductionManifest(bundle.manifest, bundle.reviewMap);
  let productionManifest;
  try { productionManifest = validateProductionManifest(selected); } catch (error) { errors.push(...(error.issues ?? [error.message])); productionManifest = selected; }
  errors.push(...referentialIssues(productionManifest));
  errors.push(...await validateSelectedMedia(productionManifest, bundle.reviewMap, bundle.files));
  const manifestBytes = enc.encode(JSON.stringify(selected, null, 2) + '\n');
  if (manifestBytes.byteLength > PRODUCTION_LIMITS.maxManifestBytes) errors.push(`Final manifest exceeds the current ${PRODUCTION_LIMITS.maxManifestBytes}-byte limit.`);
  const entries = [{ path: 'manifest.json', bytes: manifestBytes }];
  for (const asset of selected.assets) if (asset.operation === 'create' && bundle.files.has(asset.path)) entries.push({ path: asset.path, bytes: bundle.files.get(asset.path) });
  if (entries.length > PRODUCTION_LIMITS.maxArchiveEntries) errors.push(`Final package exceeds the current ${PRODUCTION_LIMITS.maxArchiveEntries}-entry limit.`);
  const decompressedBytes = entries.reduce((sum, entry) => sum + entry.bytes.byteLength, 0);
  if (decompressedBytes > PRODUCTION_LIMITS.maxUncompressedBytes) errors.push(`Final package exceeds the current ${PRODUCTION_LIMITS.maxUncompressedBytes}-byte decompressed limit.`);
  if (errors.length) throw new ReviewBundleError('Finalization failed.', [...new Set(errors)]);
  const zip = writeStoredZip(entries);
  if (zip.byteLength > PRODUCTION_LIMITS.maxArchiveBytes) throw new ReviewBundleError('Finalization failed.', [`Final package exceeds the current Import Package compressed-size limit (${PRODUCTION_LIMITS.maxArchiveBytes} bytes). Split this review batch into smaller imports.`]);
  // Stored ZIP output is deliberately the strict subset accepted by production:
  // method 0, no data descriptors/encryption, unique safe paths, root manifest.
  return { zip, manifest: selected };
}

export function exportReviewedBundle(bundle) {
  const entries = [
    { path: 'manifest.json', bytes: enc.encode(JSON.stringify(bundle.manifest, null, 2) + '\n') },
    { path: 'review-map.json', bytes: enc.encode(JSON.stringify(bundle.reviewMap, null, 2) + '\n') }
  ];
  for (const [path, bytes] of bundle.files) if (path.startsWith('media/') || path.startsWith('source-previews/')) entries.push({ path, bytes });
  return writeStoredZip(entries);
}
