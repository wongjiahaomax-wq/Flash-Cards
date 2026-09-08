import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  copyPortableArtifacts, PORTABLE_ARTIFACTS, withPreparedOutput,
} from '../cli.mjs';
import {
  validateProductionManifest, writeStoredZip,
} from '../../slide-import-review/src/core-v2.js';
import {
  loadReviewBundle, validateReviewMap,
} from '../../slide-import-review/src/core.js';
import { parseImportPackage } from '../../../src/lib/server/import/content-package.js';
import { parseImportPackage as parseReviewedImportPackage } from '../../../src/lib/server/import/reviewed-content-package.js';

const enc = new TextEncoder();
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const toolDir = fileURLToPath(new URL('..', import.meta.url));
const schemaPath = join(toolDir, 'manifest-slide-profile-v1.schema.json');
const reviewSchemaPath = join(toolDir, '..', 'slide-import-review', 'schemas', 'review-map-v1.schema.json');
const legacyPromptPath = join(toolDir, 'CHATGPT_EXTRACTION_HANDOFF_PROMPT.md');

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'slide-prep-portable-test-'));
}

function manifestFixture() {
  return {
    version: 1,
    packageId: 'slide-batch',
    topics: [{
      id: 'topic-holding', operation: 'create', name: 'Imported Slide Batch',
      slug: 'imported-slide-batch', descriptionMd: null, parentTopicId: null, isActive: true,
    }],
    cases: [{
      id: 'case-1', operation: 'create', title: 'Source-supported Case', vignetteMd: 'Source vignette',
      primaryTopicId: 'topic-holding', secondaryTopicIds: [], questionSelectionMode: 'all', isActive: true,
    }],
    assets: [{
      id: 'asset-1', operation: 'create', path: 'media/asset-1.png', mimeType: 'image/png',
      originalFilename: 'asset-1.png', altText: 'Source image',
      sourceLabel: 'Source attribution', sourceUrl: 'https://example.test/source', licence: 'CC BY 4.0',
      isActive: true,
    }],
    caseAssets: [{
      id: 'case-asset-1', operation: 'create', caseId: 'case-1', assetId: 'asset-1', displayOrder: 0, captionMd: null,
    }],
    questionPrompts: [{
      id: 'prompt-1', operation: 'create', promptMd: 'What does the source show?', isActive: true,
    }],
    caseQuestions: [{
      id: 'question-1', operation: 'create', caseId: 'case-1', questionPromptId: 'prompt-1',
      answerMd: 'The source answer.', isActive: true,
    }],
    topicQuestions: [],
  };
}

function reviewMapFixture() {
  return {
    version: 1,
    bundleId: 'bundle-1',
    batchName: 'Slide Batch',
    sourceFiles: [{ sourceId: 'source-1', filename: 'Deck.pdf', pageCount: 1 }],
    cases: [{
      caseId: 'case-1', reviewStatus: 'pending', confidence: 'medium', warnings: [],
      sourceRefs: [{ sourceId: 'source-1', pages: [1] }], caseBoundaryNotes: null,
      assets: [{
        assetId: 'asset-1', reviewStatus: 'pending', confidence: 'medium', warnings: [],
        sourceRefs: [{ sourceId: 'source-1', pages: [1] }], extractionMethod: 'embedded_original',
        sha256: null, reviewNotes: [],
      }],
      questions: [{
        caseQuestionId: 'question-1', reviewStatus: 'pending', confidence: 'medium', warnings: [],
        promptSourceRefs: [{ sourceId: 'source-1', pages: [1] }],
        answerSourceRefs: [{ sourceId: 'source-1', pages: [1] }], reviewNotes: [],
      }],
      reviewNotes: [],
    }],
    sourceCoverage: [{
      sourceId: 'source-1', page: 1, classification: 'case', caseIds: ['case-1'],
      notes: null, previewPath: 'source-previews/page-0001.png',
    }],
    unresolvedQuestions: [],
    batchWarnings: [],
  };
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

// The project intentionally has no JSON Schema runtime dependency. This small
// test-only interpreter covers the draft-2020-12 keywords used by the portable
// profile so the checked-in schema itself is exercised rather than duplicated.
function schemaErrors(value, schema, root = schema, path = '$') {
  if (schema.$ref) {
    const definition = schema.$ref.replace(/^#\/\$defs\//, '');
    return schemaErrors(value, root.$defs[definition], root, path);
  }
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((branch) => schemaErrors(value, branch, root, path).length === 0);
    return matches.length === 1 ? [] : [`${path} must match exactly one schema branch.`];
  }
  const errors = [];
  if (Object.hasOwn(schema, 'const') && !sameJson(value, schema.const)) errors.push(`${path} must equal its schema constant.`);
  if (schema.enum && !schema.enum.some((item) => sameJson(value, item))) errors.push(`${path} is not an allowed enum value.`);
  if (schema.type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return [`${path} must be an object.`];
    const properties = schema.properties ?? {};
    for (const key of schema.required ?? []) if (!Object.hasOwn(value, key)) errors.push(`${path}.${key} is required.`);
    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) if (!Object.hasOwn(properties, key)) errors.push(`${path}.${key} is not allowed.`);
    }
    for (const [key, child] of Object.entries(properties)) {
      if (Object.hasOwn(value, key)) errors.push(...schemaErrors(value[key], child, root, `${path}.${key}`));
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return [`${path} must be an array.`];
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path} has too few items.`);
    if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path} has too many items.`);
    if (schema.items) value.forEach((item, index) => errors.push(...schemaErrors(item, schema.items, root, `${path}[${index}]`)));
  } else if (schema.type === 'string') {
    if (typeof value !== 'string') return [`${path} must be a string.`];
    if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path} is empty.`);
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path} has an invalid format.`);
  } else if (schema.type === 'integer') {
    if (!Number.isInteger(value)) return [`${path} must be an integer.`];
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path} is below the minimum.`);
  } else if (schema.type === 'null') {
    if (value !== null) return [`${path} must be null.`];
  }
  return errors;
}

function assertSchemaAccepts(value, schema) {
  assert.deepEqual(schemaErrors(value, schema), [], 'Portable schema should accept the fixture.');
}

function assertSchemaRejects(value, schema) {
  assert.ok(schemaErrors(value, schema).length > 0, 'Portable schema should reject the out-of-profile fixture.');
}

test('canonical slide profile is accepted by the portable schema and production validators', async () => {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const manifest = manifestFixture();
  assertSchemaAccepts(manifest, schema);
  assert.doesNotThrow(() => validateProductionManifest(manifest));

  const zip = writeStoredZip([
    { path: 'manifest.json', bytes: enc.encode(JSON.stringify(manifest)) },
    { path: 'media/asset-1.png', bytes: png },
  ]);
  const parsed = await parseImportPackage(zip);
  assert.equal(parsed.manifest.packageId, manifest.packageId);
  assert.equal(parsed.media.size, 1);
  const reviewed = await parseReviewedImportPackage(zip);
  assert.equal(reviewed.manifest.packageId, manifest.packageId);
  assert.equal(parsed.manifest.assets[0].path, manifest.assets[0].path);
  assert.equal(parsed.manifest.assets[0].sourceLabel, manifest.assets[0].sourceLabel);
  assert.equal(parsed.manifest.assets[0].sourceUrl, manifest.assets[0].sourceUrl);
  assert.equal(parsed.manifest.assets[0].licence, manifest.assets[0].licence);

  const unavailableProvenance = structuredClone(manifest);
  unavailableProvenance.assets[0].sourceLabel = null;
  unavailableProvenance.assets[0].sourceUrl = null;
  delete unavailableProvenance.assets[0].licence;
  assertSchemaAccepts(unavailableProvenance, schema);
  assert.doesNotThrow(() => validateProductionManifest(unavailableProvenance));
});

test('portable schema rejects representative general-package structures', () => {
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

  const automatic = structuredClone(manifestFixture());
  automatic.cases[0].questionSelectionMode = 'automatic';
  assertSchemaRejects(automatic, schema);
  assert.doesNotThrow(() => validateProductionManifest(automatic));

  const secondary = structuredClone(manifestFixture());
  secondary.cases[0].secondaryTopicIds = ['topic-other'];
  assertSchemaRejects(secondary, schema);
  assert.doesNotThrow(() => validateProductionManifest(secondary));

  const topicQuestion = structuredClone(manifestFixture());
  topicQuestion.topicQuestions = [{
    id: 'topic-question-1', operation: 'create', topicId: 'topic-holding',
    questionPromptId: 'prompt-1', answerMd: 'Topic answer', isActive: true,
  }];
  assertSchemaRejects(topicQuestion, schema);
  assert.doesNotThrow(() => validateProductionManifest(topicQuestion));
});

test('canonical review-map schema and actual reviewer boundary stay aligned', async () => {
  const manifest = manifestFixture();
  const reviewMap = reviewMapFixture();
  assert.doesNotThrow(() => validateReviewMap(reviewMap, manifest, new Set(['source-previews/page-0001.png'])));
  const zip = writeStoredZip([
    { path: 'manifest.json', bytes: enc.encode(JSON.stringify(manifest)) },
    { path: 'review-map.json', bytes: enc.encode(JSON.stringify(reviewMap)) },
    { path: 'media/asset-1.png', bytes: png },
    { path: 'source-previews/page-0001.png', bytes: png },
  ]);
  const bundle = await loadReviewBundle(zip);
  assert.equal(bundle.reviewMap.sourceCoverage[0].page, 1);
  assert.deepEqual(
    readFileSync(join(toolDir, '..', 'slide-import-review', 'schemas', 'review-map-v1.schema.json')),
    readFileSync(reviewSchemaPath),
  );
});

test('actual reviewer boundary rejects an original-numbered later chunk as a final source', async () => {
  const manifest = manifestFixture();
  const incompleteBatch = reviewMapFixture();
  incompleteBatch.sourceFiles[0].pageCount = 40;
  assert.throws(
    () => validateReviewMap(incompleteBatch, manifest, new Set(['source-previews/page-0001.png'])),
    /missing source-1 page 2/,
  );

  const laterChunk = reviewMapFixture();
  laterChunk.sourceFiles[0].pageCount = 40;
  laterChunk.cases[0].sourceRefs[0].pages = [41];
  laterChunk.cases[0].assets[0].sourceRefs[0].pages = [41];
  laterChunk.cases[0].questions[0].promptSourceRefs[0].pages = [41];
  laterChunk.cases[0].questions[0].answerSourceRefs[0].pages = [41];
  laterChunk.sourceCoverage[0].page = 41;
  laterChunk.sourceCoverage[0].previewPath = 'source-previews/page-0041.png';
  const previewPaths = new Set(['source-previews/page-0041.png']);

  assert.throws(
    () => validateReviewMap(laterChunk, manifest, previewPaths),
    /beyond declared pageCount 40|exceeds declared pageCount 40/,
  );

  const zip = writeStoredZip([
    { path: 'manifest.json', bytes: enc.encode(JSON.stringify(manifest)) },
    { path: 'review-map.json', bytes: enc.encode(JSON.stringify(laterChunk)) },
    { path: 'media/asset-1.png', bytes: png },
    { path: 'source-previews/page-0041.png', bytes: png },
  ]);
  await assert.rejects(
    () => loadReviewBundle(zip),
    /beyond declared pageCount 40|exceeds declared pageCount 40/,
  );
});

test('portable prompt and contract are self-contained and the legacy prompt is retired', () => {
  const prompt = readFileSync(join(toolDir, 'AI_EXTRACTION_HANDOFF_PROMPT.md'), 'utf8');
  const contract = readFileSync(join(toolDir, 'AI_EXTRACTION_CONTRACT.md'), 'utf8');
  const forbiddenRuntimeDependencies = /github|repository|(^|[^a-z])main([^a-z]|$)|source code|cloudflare|\bd1\b|\br2\b|browse the web/i;
  assert.doesNotMatch(prompt, forbiddenRuntimeDependencies);
  assert.doesNotMatch(contract, forbiddenRuntimeDependencies);
  assert.match(prompt, /AI_EXTRACTION_CONTRACT\.md/);
  assert.match(contract, /manifest-slide-profile-v1\.schema\.json/);
  assert.equal(existsSync(legacyPromptPath), false);
});

test('successful portable artifact packaging copies the exact four root inputs', () => {
  const root = tempDir();
  const outputDir = join(root, 'Deck-prepared');
  try {
    mkdirSync(outputDir);
    const copied = copyPortableArtifacts(outputDir);
    assert.deepEqual(copied.map((path) => basename(path)), PORTABLE_ARTIFACTS.map((artifact) => artifact.fileName));
    for (const artifact of PORTABLE_ARTIFACTS) {
      assert.deepEqual(
        readFileSync(join(outputDir, artifact.fileName)),
        readFileSync(artifact.sourcePath),
        `${artifact.fileName} must be copied byte-for-byte.`,
      );
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('portable artifact copy failure removes the newly-created prepared root', () => {
  const root = tempDir();
  const outputDir = join(root, 'Deck-prepared');
  const missingSource = join(root, 'missing-portable-artifact.md');
  try {
    assert.throws(() => withPreparedOutput(outputDir, false, () => {
      writeFileSync(join(outputDir, 'partial-source-evidence.md'), 'partial');
      copyPortableArtifacts(outputDir, [
        PORTABLE_ARTIFACTS[0],
        { sourcePath: missingSource, fileName: 'AI_EXTRACTION_CONTRACT.md' },
      ]);
    }), /ENOENT|no such file/i);
    assert.equal(existsSync(outputDir), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
