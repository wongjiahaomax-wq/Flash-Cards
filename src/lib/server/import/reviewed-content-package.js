// Hardened facade for the administrator-reviewed content-package workflow.
// The core importer remains responsible for domain parsing/writes; this layer
// enforces archive resource bounds and cross-row invariants before it is called.
// @ts-nocheck

import { and, eq } from 'drizzle-orm';

import {
  assets,
  caseAssets,
  caseQuestions,
  conceptQuestions,
  concepts
} from '../db/schema.js';
import { MAX_IMAGE_BYTES } from '../storage/media.js';
import {
  ContentPackageError,
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_MANIFEST_BYTES,
  MAX_UNCOMPRESSED_BYTES,
  deterministicStorageKey,
  importContentPackage as importContentPackageCore,
  parseImportPackage as parseImportPackageCore,
  validateImportPackage as validateImportPackageCore
} from './content-package.js';

export {
  ContentPackageError,
  IMPORT_PACKAGE_VERSION,
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_MANIFEST_BYTES,
  MAX_UNCOMPRESSED_BYTES,
  deterministicApplicationId,
  deterministicStorageKey,
  validateImportMimeType
} from './content-package.js';

const HARDENING_VERSION = 1;
const UTF8 = new TextDecoder('utf-8', { fatal: true });

/** @param {ArrayBuffer | Uint8Array | Blob} input */
async function toBytes(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(await input.arrayBuffer());
}

/** @param {Uint8Array} bytes @param {number} offset @param {number} length @param {string} message */
function requireRange(bytes, offset, length, message) {
  if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new ContentPackageError(message);
  }
}

/** @param {Uint8Array} bytes @param {number} offset */
function u16(bytes, offset) {
  requireRange(bytes, offset, 2, 'ZIP structure is truncated.');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

/** @param {Uint8Array} bytes @param {number} offset */
function u32(bytes, offset) {
  requireRange(bytes, offset, 4, 'ZIP structure is truncated.');
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

/** @param {Uint8Array} bytes @param {number} start @param {number} length @param {string} label */
function decodeUtf8(bytes, start, length, label) {
  requireRange(bytes, start, length, `${label} is truncated.`);
  try {
    return UTF8.decode(bytes.slice(start, start + length));
  } catch {
    throw new ContentPackageError(`${label} is not valid UTF-8.`);
  }
}

/** @param {string} path */
function assertSafePath(path) {
  if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
    throw new ContentPackageError(`Unsafe ZIP path: ${path}.`);
  }
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) {
    throw new ContentPackageError(`Unsafe ZIP path: ${path}.`);
  }
  if (path !== 'manifest.json' && !path.startsWith('media/')) {
    throw new ContentPackageError(`Unexpected ZIP path: ${path}.`);
  }
}

/** @param {Uint8Array} bytes @param {number} start @param {number} length @param {string} path */
function rejectZip64Extra(bytes, start, length, path) {
  requireRange(bytes, start, length, `ZIP extra data is truncated for ${path}.`);
  let cursor = start;
  const end = start + length;
  while (cursor < end) {
    requireRange(bytes, cursor, 4, `ZIP extra data is malformed for ${path}.`);
    const id = u16(bytes, cursor);
    const size = u16(bytes, cursor + 2);
    cursor += 4;
    requireRange(bytes, cursor, size, `ZIP extra data is malformed for ${path}.`);
    if (id === 0x0001) throw new ContentPackageError('ZIP64 archives are not supported.');
    cursor += size;
  }
}

/** @param {Uint8Array} bytes */
function endOfCentralDirectory(bytes) {
  if (bytes.length < 22) throw new ContentPackageError('ZIP end-of-central-directory record is missing.');
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (u32(bytes, offset) === 0x06054b50) return offset;
  }
  throw new ContentPackageError('ZIP end-of-central-directory record is missing.');
}

/** @param {Uint8Array} compressed @param {number} expectedBytes @param {string} path */
async function verifyDeflatedSize(compressed, expectedBytes, path) {
  if (typeof DecompressionStream === 'undefined') {
    throw new ContentPackageError('This runtime cannot decompress deflated ZIP entries.');
  }
  const buffer = /** @type {ArrayBuffer} */ (compressed.slice().buffer);
  const reader = new Blob([buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > expectedBytes) {
        await reader.cancel();
        throw new ContentPackageError(`ZIP entry ${path} exceeds its declared decompressed size.`);
      }
    }
  } catch (error) {
    if (error instanceof ContentPackageError) throw error;
    throw new ContentPackageError(`ZIP entry ${path} could not be decompressed safely.`);
  }
  if (total !== expectedBytes) {
    throw new ContentPackageError(`ZIP entry size mismatch: ${path}.`);
  }
}

/** @param {Uint8Array} bytes */
async function preflightZip(bytes) {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new ContentPackageError(`ZIP package exceeds the ${MAX_ARCHIVE_BYTES}-byte compressed limit.`);
  }

  const eocd = endOfCentralDirectory(bytes);
  requireRange(bytes, eocd, 22, 'ZIP end-of-central-directory record is truncated.');
  const diskNumber = u16(bytes, eocd + 4);
  const centralDisk = u16(bytes, eocd + 6);
  const entriesOnDisk = u16(bytes, eocd + 8);
  const entryCount = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralOffset = u32(bytes, eocd + 16);
  const commentLength = u16(bytes, eocd + 20);

  if (diskNumber !== 0 || centralDisk !== 0 || entriesOnDisk !== entryCount) {
    throw new ContentPackageError('Multi-disk ZIP archives are not supported.');
  }
  if (entryCount === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new ContentPackageError('ZIP64 archives are not supported.');
  }
  if (entryCount > MAX_ARCHIVE_ENTRIES) {
    throw new ContentPackageError(`ZIP package contains more than ${MAX_ARCHIVE_ENTRIES} entries.`);
  }
  if (eocd + 22 + commentLength !== bytes.length) {
    throw new ContentPackageError('ZIP end-of-central-directory length is inconsistent.');
  }
  if (centralOffset + centralSize !== eocd) {
    throw new ContentPackageError('ZIP central directory length is inconsistent.');
  }

  const entries = [];
  const paths = new Set();
  let cursor = centralOffset;
  let declaredTotal = 0;

  for (let index = 0; index < entryCount; index += 1) {
    requireRange(bytes, cursor, 46, 'ZIP central directory entry is truncated.');
    if (u32(bytes, cursor) !== 0x02014b50) throw new ContentPackageError('ZIP central directory entry is invalid.');

    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const crc32 = u32(bytes, cursor + 16);
    const compressedSize = u32(bytes, cursor + 20);
    const uncompressedSize = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const entryCommentLength = u16(bytes, cursor + 32);
    const localOffset = u32(bytes, cursor + 42);
    const recordLength = 46 + nameLength + extraLength + entryCommentLength;
    requireRange(bytes, cursor, recordLength, 'ZIP central directory entry is truncated.');

    const path = decodeUtf8(bytes, cursor + 46, nameLength, 'ZIP filename');
    assertSafePath(path);
    if (paths.has(path)) throw new ContentPackageError(`Duplicate ZIP entry: ${path}.`);
    paths.add(path);
    if (flags & 1) throw new ContentPackageError(`Encrypted ZIP entry is not supported: ${path}.`);
    if (flags & 8) throw new ContentPackageError(`ZIP data descriptors are not supported: ${path}.`);
    if (method !== 0 && method !== 8) throw new ContentPackageError(`ZIP compression method ${method} is not supported.`);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localOffset === 0xffffffff) {
      throw new ContentPackageError('ZIP64 archives are not supported.');
    }
    rejectZip64Extra(bytes, cursor + 46 + nameLength, extraLength, path);

    if (path === 'manifest.json' && uncompressedSize > MAX_MANIFEST_BYTES) {
      throw new ContentPackageError(`manifest.json exceeds the ${MAX_MANIFEST_BYTES}-byte limit.`);
    }
    if (path.startsWith('media/') && uncompressedSize > MAX_IMAGE_BYTES) {
      throw new ContentPackageError(`Media ${path} exceeds the ${MAX_IMAGE_BYTES}-byte individual image limit.`);
    }

    declaredTotal += uncompressedSize;
    if (uncompressedSize > MAX_UNCOMPRESSED_BYTES || declaredTotal > MAX_UNCOMPRESSED_BYTES) {
      throw new ContentPackageError(`ZIP package exceeds the ${MAX_UNCOMPRESSED_BYTES}-byte decompressed limit.`);
    }

    entries.push({ path, flags, method, crc32, compressedSize, uncompressedSize, localOffset });
    cursor += recordLength;
  }

  if (cursor !== eocd) throw new ContentPackageError('ZIP central directory length is inconsistent.');

  let verifiedTotal = 0;
  for (const entry of entries) {
    const offset = entry.localOffset;
    requireRange(bytes, offset, 30, `ZIP local header is truncated for ${entry.path}.`);
    if (u32(bytes, offset) !== 0x04034b50) throw new ContentPackageError('ZIP entry has an invalid local header.');

    const flags = u16(bytes, offset + 6);
    const method = u16(bytes, offset + 8);
    const crc32 = u32(bytes, offset + 14);
    const compressedSize = u32(bytes, offset + 18);
    const uncompressedSize = u32(bytes, offset + 22);
    const nameLength = u16(bytes, offset + 26);
    const extraLength = u16(bytes, offset + 28);
    const headerLength = 30 + nameLength + extraLength;
    requireRange(bytes, offset, headerLength, `ZIP local header is truncated for ${entry.path}.`);

    const path = decodeUtf8(bytes, offset + 30, nameLength, 'ZIP filename');
    if (path !== entry.path) throw new ContentPackageError(`ZIP local and central filenames differ for ${entry.path}.`);
    rejectZip64Extra(bytes, offset + 30 + nameLength, extraLength, path);
    if (flags !== entry.flags || method !== entry.method || crc32 !== entry.crc32 || compressedSize !== entry.compressedSize || uncompressedSize !== entry.uncompressedSize) {
      throw new ContentPackageError(`ZIP local and central metadata differ for ${entry.path}.`);
    }

    const dataStart = offset + headerLength;
    const dataEnd = dataStart + compressedSize;
    requireRange(bytes, dataStart, compressedSize, `ZIP entry is truncated: ${entry.path}.`);
    if (dataEnd > centralOffset) throw new ContentPackageError(`ZIP entry overlaps the central directory: ${entry.path}.`);

    if (method === 0) {
      if (compressedSize !== uncompressedSize) throw new ContentPackageError(`ZIP entry size mismatch: ${entry.path}.`);
    } else {
      await verifyDeflatedSize(bytes.slice(dataStart, dataEnd), uncompressedSize, entry.path);
    }

    verifiedTotal += uncompressedSize;
    if (verifiedTotal > MAX_UNCOMPRESSED_BYTES) {
      throw new ContentPackageError(`ZIP package exceeds the ${MAX_UNCOMPRESSED_BYTES}-byte decompressed limit.`);
    }
  }
}

/** @param {ArrayBuffer | Uint8Array | Blob} input */
export async function importPackageDigest(input) {
  const bytes = await toBytes(input);
  if (!globalThis.crypto?.subtle) throw new ContentPackageError('This runtime cannot calculate an import-package digest.');
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** @param {ArrayBuffer | Uint8Array | Blob} input */
export async function parseImportPackage(input) {
  const bytes = await toBytes(input);
  await preflightZip(bytes);
  const parsed = await parseImportPackageCore(bytes);
  return { ...parsed, hardeningVersion: HARDENING_VERSION };
}

/** @param {any} parsed */
function previewFor(parsed) {
  const count = (collection, operation) => parsed.manifest[collection].filter((item) => item.operation === operation).length;
  return {
    topics: { create: count('topics', 'create'), use: count('topics', 'use'), skip: count('topics', 'skip') },
    cases: { create: count('cases', 'create'), use: count('cases', 'use'), skip: count('cases', 'skip') },
    imagesToUpload: parsed.manifest.assets.filter((item) => item.operation === 'create').length,
    assets: { create: count('assets', 'create'), use: count('assets', 'use'), skip: count('assets', 'skip') },
    questionPrompts: parsed.manifest.questionPrompts.length,
    caseQuestions: parsed.manifest.caseQuestions.filter((item) => item.operation !== 'skip').length,
    topicQuestions: parsed.manifest.topicQuestions.filter((item) => item.operation !== 'skip').length,
    primaryTopicLinks: parsed.manifest.cases.filter((item) => item.operation !== 'skip' && item.primaryTopicId).length,
    secondaryTopicLinks: parsed.manifest.cases.filter((item) => item.operation !== 'skip').reduce((total, item) => total + item.secondaryTopicIds.length, 0),
    caseAssetLinks: parsed.manifest.caseAssets.filter((item) => item.operation !== 'skip').length
  };
}

/** @param {any[]} items @param {(item: any) => string} keyFor @param {(item: any) => string} labelFor @param {string[]} issues */
function rejectDuplicateCreates(items, keyFor, labelFor, issues) {
  const seen = new Map();
  for (const item of items) {
    if (item.operation !== 'create') continue;
    const key = keyFor(item);
    const previous = seen.get(key);
    if (previous) issues.push(`${labelFor(item)} conflicts with ${labelFor(previous)} inside the same package.`);
    else seen.set(key, item);
  }
}

/** @param {any} parsed */
function manifestHardeningIssues(parsed) {
  const issues = [];
  const manifest = parsed.manifest;

  const visiting = new Set();
  const visited = new Set();
  const topics = new Map(manifest.topics.map((item) => [item.id, item]));
  function visit(id) {
    if (visiting.has(id)) {
      issues.push(`Topic parent relationship contains a cycle at ${id}.`);
      return;
    }
    if (visited.has(id)) return;
    visiting.add(id);
    const parent = topics.get(id)?.parentTopicId;
    if (parent && topics.has(parent)) visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for (const topic of manifest.topics) visit(topic.id);

  const skippedTopics = new Set(manifest.topics.filter((item) => item.operation === 'skip').map((item) => item.id));
  const skippedCases = new Set(manifest.cases.filter((item) => item.operation === 'skip').map((item) => item.id));
  const skippedAssets = new Set(manifest.assets.filter((item) => item.operation === 'skip').map((item) => item.id));
  const skippedPrompts = new Set(manifest.questionPrompts.filter((item) => item.operation === 'skip').map((item) => item.id));

  for (const topic of manifest.topics) {
    if (topic.operation !== 'skip' && topic.parentTopicId && skippedTopics.has(topic.parentTopicId)) {
      issues.push(`Topic ${topic.id} references skipped parent Topic ${topic.parentTopicId}; mark the parent use if this package depends on it.`);
    }
  }
  for (const item of manifest.cases) {
    if (item.operation === 'skip') continue;
    if (item.primaryTopicId && skippedTopics.has(item.primaryTopicId)) {
      issues.push(`Case ${item.id} references skipped primary Topic ${item.primaryTopicId}; mark the Topic use if this package depends on it.`);
    }
    for (const topicId of item.secondaryTopicIds) {
      if (skippedTopics.has(topicId)) {
        issues.push(`Case ${item.id} references skipped secondary Topic ${topicId}; mark the Topic use if this package depends on it.`);
      }
    }
  }
  for (const item of manifest.caseAssets) {
    if (item.operation === 'skip') continue;
    if (skippedCases.has(item.caseId)) {
      issues.push(`Case Asset ${item.id} references skipped Case ${item.caseId}; mark the Case use if this package should attach an Asset to it.`);
    }
    if (skippedAssets.has(item.assetId)) {
      issues.push(`Case Asset ${item.id} references skipped Asset ${item.assetId}; mark the Asset use if this package depends on it.`);
    }
  }
  for (const item of manifest.caseQuestions) {
    if (item.operation === 'skip') continue;
    if (skippedCases.has(item.owner)) {
      issues.push(`Case Question ${item.id} references skipped Case ${item.owner}; mark the Case use if this package should add or reuse a Question on it.`);
    }
    if (skippedPrompts.has(item.questionPromptId)) {
      issues.push(`Case Question ${item.id} references skipped Question Prompt ${item.questionPromptId}; mark the Prompt use if this package depends on it.`);
    }
  }
  for (const item of manifest.topicQuestions) {
    if (item.operation === 'skip') continue;
    if (skippedTopics.has(item.owner)) {
      issues.push(`Topic Question ${item.id} references skipped Topic ${item.owner}; mark the Topic use if this package should add or reuse a Question on it.`);
    }
    if (skippedPrompts.has(item.questionPromptId)) {
      issues.push(`Topic Question ${item.id} references skipped Question Prompt ${item.questionPromptId}; mark the Prompt use if this package depends on it.`);
    }
  }

  rejectDuplicateCreates(manifest.topics, (item) => item.slug, (item) => `Topic ${item.id} slug ${item.slug}`, issues);
  rejectDuplicateCreates(manifest.caseAssets, (item) => `${item.caseId}\0asset\0${item.assetId}`, (item) => `Case Asset ${item.id}`, issues);
  rejectDuplicateCreates(manifest.caseAssets, (item) => `${item.caseId}\0order\0${item.displayOrder}`, (item) => `Case Asset ${item.id} display order ${item.displayOrder}`, issues);
  rejectDuplicateCreates(manifest.caseQuestions, (item) => `${item.owner}\0${item.questionPromptId}`, (item) => `Case Question ${item.id}`, issues);
  rejectDuplicateCreates(manifest.topicQuestions, (item) => `${item.owner}\0${item.questionPromptId}`, (item) => `Topic Question ${item.id}`, issues);

  return issues;
}

/** @param {any} db @param {any} table @param {string} id */
async function rowById(db, table, id) {
  return (await db.select().from(table).where(eq(table.id, id)).limit(1))[0] ?? null;
}

/** @param {any} db @param {any} plan */
async function databaseHardeningIssues(db, plan) {
  const issues = [];
  const { parsed, resolved } = plan;
  const manifest = parsed.manifest;

  for (const item of manifest.topics) {
    if (item.operation !== 'create') continue;
    const appId = resolved.topics.get(item.id);
    const slugRow = (await db.select({ id: concepts.id }).from(concepts).where(eq(concepts.slug, item.slug)).limit(1))[0] ?? null;
    if (slugRow && slugRow.id !== appId) issues.push(`Topic ${item.id} slug ${item.slug} is already used by application Topic ${slugRow.id}.`);
  }

  for (const item of manifest.assets) {
    if (item.operation !== 'create') continue;
    const appId = resolved.assets.get(item.id);
    const expectedStorageKey = deterministicStorageKey(manifest.packageId, item.id, item.mimeType);
    const row = await rowById(db, assets, appId);
    if (row && row.storageKey !== expectedStorageKey) {
      issues.push(`Asset ${item.id} conflicts with the deterministic storage key expected for this package.`);
    }
    const storageRow = (await db.select({ id: assets.id }).from(assets).where(eq(assets.storageKey, expectedStorageKey)).limit(1))[0] ?? null;
    if (storageRow && storageRow.id !== appId) {
      issues.push(`Asset ${item.id} deterministic storage key is already used by application Asset ${storageRow.id}.`);
    }
  }

  for (const item of manifest.caseAssets) {
    if (item.operation !== 'create') continue;
    const caseId = resolved.cases.get(item.caseId);
    const assetId = resolved.assets.get(item.assetId);
    const orderRow = (await db.select({ assetId: caseAssets.assetId }).from(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.displayOrder, item.displayOrder))).limit(1))[0] ?? null;
    if (orderRow && orderRow.assetId !== assetId) {
      issues.push(`Case Asset ${item.id} display order ${item.displayOrder} is already occupied in the target Case.`);
    }
  }

  for (const item of manifest.caseQuestions) {
    const caseId = resolved.cases.get(item.owner);
    const promptId = resolved.questionPrompts.get(item.questionPromptId);
    if (!caseId || !promptId) continue;
    const appId = item.operation === 'create' ? resolved.caseQuestions.get(item.id) : item.applicationId;
    const row = appId ? await rowById(db, caseQuestions, appId) : null;
    if (item.operation !== 'create' && row && (row.caseId !== caseId || row.questionPromptId !== promptId)) {
      issues.push(`Case Question ${item.id} application ID does not belong to the declared Case and Question Prompt.`);
    }
    if (item.operation === 'create') {
      const uniqueRow = (await db.select({ id: caseQuestions.id }).from(caseQuestions).where(and(eq(caseQuestions.caseId, caseId), eq(caseQuestions.questionPromptId, promptId))).limit(1))[0] ?? null;
      if (uniqueRow && uniqueRow.id !== appId) {
        issues.push(`Case Question ${item.id} conflicts with an existing Case/Prompt relationship ${uniqueRow.id}.`);
      }
    }
  }

  for (const item of manifest.topicQuestions) {
    const conceptId = resolved.topics.get(item.owner);
    const promptId = resolved.questionPrompts.get(item.questionPromptId);
    if (!conceptId || !promptId) continue;
    const appId = item.operation === 'create' ? resolved.topicQuestions.get(item.id) : item.applicationId;
    const row = appId ? await rowById(db, conceptQuestions, appId) : null;
    if (item.operation !== 'create' && row && (row.conceptId !== conceptId || row.questionPromptId !== promptId)) {
      issues.push(`Topic Question ${item.id} application ID does not belong to the declared Topic and Question Prompt.`);
    }
    if (item.operation === 'create') {
      const uniqueRow = (await db.select({ id: conceptQuestions.id }).from(conceptQuestions).where(and(eq(conceptQuestions.conceptId, conceptId), eq(conceptQuestions.questionPromptId, promptId))).limit(1))[0] ?? null;
      if (uniqueRow && uniqueRow.id !== appId) {
        issues.push(`Topic Question ${item.id} conflicts with an existing Topic/Prompt relationship ${uniqueRow.id}.`);
      }
    }
  }

  return issues;
}

/** @param {any[]} topics */
function topologicallyOrderTopics(topics) {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  const orderedCreates = [];
  const visiting = new Set();
  const visited = new Set();

  function visit(topic) {
    if (visited.has(topic.id)) return;
    if (visiting.has(topic.id)) throw new ContentPackageError(`Topic parent relationship contains a cycle at ${topic.id}.`);
    visiting.add(topic.id);
    const parent = topic.parentTopicId ? byId.get(topic.parentTopicId) : null;
    if (parent?.operation === 'create') visit(parent);
    visiting.delete(topic.id);
    visited.add(topic.id);
    orderedCreates.push(topic);
  }

  for (const topic of topics) if (topic.operation === 'create') visit(topic);
  return [...topics.filter((topic) => topic.operation !== 'create'), ...orderedCreates];
}

/** @param {any} db @param {any} parsed */
export async function validateImportPackage(db, parsed) {
  if (parsed?.hardeningVersion !== HARDENING_VERSION) {
    throw new ContentPackageError('The package must pass the hardened ZIP preflight before validation.');
  }

  const earlyIssues = manifestHardeningIssues(parsed);
  if (earlyIssues.length) {
    return { valid: false, errors: earlyIssues, warnings: [], preview: previewFor(parsed), plan: null };
  }

  const validation = await validateImportPackageCore(db, parsed);
  if (!validation.valid || !validation.plan) return validation;

  const extraIssues = await databaseHardeningIssues(db, validation.plan);
  if (extraIssues.length) {
    return { ...validation, valid: false, errors: [...validation.errors, ...extraIssues], plan: null };
  }

  validation.plan.parsed.manifest.topics = topologicallyOrderTopics(validation.plan.parsed.manifest.topics);
  validation.plan.hardeningVersion = HARDENING_VERSION;
  return validation;
}

/** @param {any} db @param {any} bucket @param {any} validation */
export async function importContentPackage(db, bucket, validation) {
  if (validation?.plan?.hardeningVersion !== HARDENING_VERSION) {
    throw new ContentPackageError('The package must pass hardened validation before import.');
  }
  return importContentPackageCore(db, bucket, validation);
}