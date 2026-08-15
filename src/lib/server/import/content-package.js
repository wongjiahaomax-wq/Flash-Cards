// The validator operates on deliberately dynamic hostile JSON; runtime validation below is authoritative.
// @ts-nocheck

import { and, eq } from 'drizzle-orm';

import {
  assets,
  caseAssets,
  caseConcepts,
  caseQuestions,
  cases,
  conceptQuestions,
  concepts,
  questionPrompts
} from '../db/schema.js';
import { deleteTeachingImage, putTeachingImage, assertSupportedImageType, MAX_IMAGE_BYTES } from '../storage/media.js';

export const IMPORT_PACKAGE_VERSION = 1;
export const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
export const MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 256;
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

const ENTITY_COLLECTIONS = [
  'topics',
  'cases',
  'assets',
  'caseAssets',
  'questionPrompts',
  'caseQuestions',
  'topicQuestions'
];
const OBJECT_OPERATIONS = new Set(['create', 'use', 'skip']);
const RELATION_OPERATIONS = new Set(['create', 'use', 'skip']);
const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const PACKAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const MIME_TYPES = new Set(['image/jpeg', 'image/png']);

const TABLES = {
  topics: concepts,
  cases,
  assets,
  questionPrompts,
  caseQuestions,
  topicQuestions: conceptQuestions
};

export class ContentPackageError extends Error {
  /** @param {string} message @param {string[]} [issues] */
  constructor(message, issues = []) {
    super(message);
    this.name = 'ContentPackageError';
    this.issues = issues.length ? issues : [message];
  }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** @param {unknown} value @param {string} path @returns {string} */
function requiredString(value, path) {
  if (typeof value !== 'string' || !value.trim()) throw new ContentPackageError(`${path} must be a non-empty string.`);
  return value.trim();
}

/** @param {unknown} value @param {string} path @returns {string | null} */
function optionalString(value, path) {
  if (value === undefined || value === null) return null;
  return requiredString(value, path);
}

/** @param {unknown} value @param {string} path */
function optionalBoolean(value, path) {
  if (value === undefined) return true;
  if (typeof value !== 'boolean') throw new ContentPackageError(`${path} must be boolean.`);
  return value;
}

/** @param {Record<string, unknown>} value @param {string[]} allowed @param {string} path */
function assertAllowedKeys(value, allowed, path) {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) throw new ContentPackageError(`${path}.${key} is not supported.`);
  }
}

/** @param {unknown} value @param {string} path @returns {Record<string, unknown>} */
function objectValue(value, path) {
  if (!isObject(value)) throw new ContentPackageError(`${path} must be an object.`);
  return value;
}

/** @param {unknown} value @param {string} path @returns {Record<string, unknown>[]} */
function arrayValue(value, path) {
  if (!Array.isArray(value)) throw new ContentPackageError(`${path} must be an array.`);
  return value.map((item, index) => objectValue(item, `${path}[${index}]`));
}

/** @param {Record<string, unknown>} item @param {string} path */
function packageEntityId(item, path) {
  const id = requiredString(item.id, `${path}.id`);
  if (!ENTITY_ID_PATTERN.test(id)) throw new ContentPackageError(`${path}.id contains unsupported characters.`);
  return id;
}

/** @param {Record<string, unknown>} item @param {string} path @param {Set<string>} operations */
function operation(item, path, operations = OBJECT_OPERATIONS) {
  const value = requiredString(item.operation, `${path}.operation`);
  if (!operations.has(value)) throw new ContentPackageError(`${path}.operation must be create, use, or skip.`);
  if (value === 'create' && item.applicationId !== undefined) {
    throw new ContentPackageError(`${path}.applicationId is only allowed for use or skip.`);
  }
  if ((value === 'use' || value === 'skip') && !item.applicationId) {
    throw new ContentPackageError(`${path}.applicationId is required for ${value}.`);
  }
  if (item.applicationId !== undefined) requiredString(item.applicationId, `${path}.applicationId`);
  return /** @type {'create'|'use'|'skip'} */ (value);
}

/** @param {string} path @param {unknown} value */
function packageReference(value, path) {
  const id = requiredString(value, path);
  if (!ENTITY_ID_PATTERN.test(id)) throw new ContentPackageError(`${path} contains an invalid package-local identifier.`);
  return id;
}

/** @param {Record<string, unknown>} item @param {string} path */
function parseTopic(item, path) {
  assertAllowedKeys(item, ['id', 'operation', 'applicationId', 'name', 'slug', 'descriptionMd', 'parentTopicId', 'isActive'], path);
  const op = operation(item, path);
  if (op === 'create') {
    requiredString(item.name, `${path}.name`);
    requiredString(item.slug, `${path}.slug`);
  }
  return {
    id: packageEntityId(item, path), operation: op,
    applicationId: item.applicationId ? requiredString(item.applicationId, `${path}.applicationId`) : null,
    name: item.name === undefined ? null : requiredString(item.name, `${path}.name`),
    slug: item.slug === undefined ? null : requiredString(item.slug, `${path}.slug`),
    descriptionMd: optionalString(item.descriptionMd, `${path}.descriptionMd`),
    parentTopicId: item.parentTopicId === undefined || item.parentTopicId === null ? null : packageReference(item.parentTopicId, `${path}.parentTopicId`),
    isActive: optionalBoolean(item.isActive, `${path}.isActive`)
  };
}

/** @param {Record<string, unknown>} item @param {string} path */
function parseCase(item, path) {
  assertAllowedKeys(item, ['id', 'operation', 'applicationId', 'title', 'vignetteMd', 'primaryTopicId', 'secondaryTopicIds', 'questionSelectionMode', 'questionCount', 'isActive'], path);
  const op = operation(item, path);
  const secondary = item.secondaryTopicIds === undefined ? [] : item.secondaryTopicIds;
  if (!Array.isArray(secondary)) throw new ContentPackageError(`${path}.secondaryTopicIds must be an array.`);
  const secondaryTopicIds = secondary.map((id, index) => packageReference(id, `${path}.secondaryTopicIds[${index}]`));
  const primaryTopicId = item.primaryTopicId === undefined ? null : packageReference(item.primaryTopicId, `${path}.primaryTopicId`);
  if (op === 'create' && (!primaryTopicId || typeof item.title !== 'string' || !item.title.trim())) {
    throw new ContentPackageError(`${path} create entries require title and exactly one primaryTopicId.`);
  }
  if (primaryTopicId && secondaryTopicIds.includes(primaryTopicId)) throw new ContentPackageError(`${path} cannot use the primary Topic as a secondary Topic.`);
  if (new Set(secondaryTopicIds).size !== secondaryTopicIds.length) throw new ContentPackageError(`${path}.secondaryTopicIds contains a duplicate Topic.`);
  const mode = item.questionSelectionMode === undefined ? 'automatic' : requiredString(item.questionSelectionMode, `${path}.questionSelectionMode`);
  if (!['automatic', 'all', 'fixed'].includes(mode)) throw new ContentPackageError(`${path}.questionSelectionMode is invalid.`);
  const count = item.questionCount === undefined || item.questionCount === null ? null : Number(item.questionCount);
  if (mode === 'fixed' && (count === null || !Number.isInteger(count) || count < 1)) throw new ContentPackageError(`${path}.questionCount must be a positive integer for fixed selection.`);
  if (mode !== 'fixed' && count !== null) throw new ContentPackageError(`${path}.questionCount is only allowed with fixed selection.`);
  return {
    id: packageEntityId(item, path), operation: op,
    applicationId: item.applicationId ? requiredString(item.applicationId, `${path}.applicationId`) : null,
    title: item.title === undefined ? null : requiredString(item.title, `${path}.title`),
    vignetteMd: optionalString(item.vignetteMd, `${path}.vignetteMd`), primaryTopicId, secondaryTopicIds,
    questionSelectionMode: mode, questionCount: count, isActive: optionalBoolean(item.isActive, `${path}.isActive`)
  };
}

/** @param {Record<string, unknown>} item @param {string} path */
function parseAsset(item, path) {
  assertAllowedKeys(item, ['id', 'operation', 'applicationId', 'path', 'mimeType', 'originalFilename', 'altText', 'sourceLabel', 'sourceUrl', 'licence', 'isActive'], path);
  const op = operation(item, path);
  const mimeType = item.mimeType === undefined ? null : requiredString(item.mimeType, `${path}.mimeType`);
  if (mimeType && !MIME_TYPES.has(mimeType)) throw new ContentPackageError(`${path}.mimeType must be image/jpeg or image/png.`);
  const mediaPath = item.path === undefined ? null : requiredString(item.path, `${path}.path`);
  if (op === 'create') {
    if (!mediaPath || !mimeType) throw new ContentPackageError(`${path} create entries require path and mimeType.`);
    requiredString(item.altText, `${path}.altText`);
    assertSafeArchivePath(mediaPath);
  } else if (mediaPath) {
    throw new ContentPackageError(`${path}.path is only allowed for create entries.`);
  }
  if (item.sourceUrl !== undefined && item.sourceUrl !== null) {
    let parsedUrl;
    try { parsedUrl = new URL(requiredString(item.sourceUrl, `${path}.sourceUrl`)); }
    catch { throw new ContentPackageError(`${path}.sourceUrl must be a valid http(s) URL.`); }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new ContentPackageError(`${path}.sourceUrl must be a valid http(s) URL.`);
  }
  return {
    id: packageEntityId(item, path), operation: op,
    applicationId: item.applicationId ? requiredString(item.applicationId, `${path}.applicationId`) : null,
    path: mediaPath, mimeType, originalFilename: optionalString(item.originalFilename, `${path}.originalFilename`),
    altText: item.altText === undefined ? null : requiredString(item.altText, `${path}.altText`),
    sourceLabel: optionalString(item.sourceLabel, `${path}.sourceLabel`), sourceUrl: optionalString(item.sourceUrl, `${path}.sourceUrl`),
    licence: optionalString(item.licence, `${path}.licence`), isActive: optionalBoolean(item.isActive, `${path}.isActive`)
  };
}

/** @param {Record<string, unknown>} item @param {string} path */
function parsePrompt(item, path) {
  assertAllowedKeys(item, ['id', 'operation', 'applicationId', 'promptMd', 'isActive'], path);
  const op = operation(item, path);
  if (op === 'create') requiredString(item.promptMd, `${path}.promptMd`);
  return {
    id: packageEntityId(item, path), operation: op,
    applicationId: item.applicationId ? requiredString(item.applicationId, `${path}.applicationId`) : null,
    promptMd: item.promptMd === undefined ? null : requiredString(item.promptMd, `${path}.promptMd`), isActive: optionalBoolean(item.isActive, `${path}.isActive`)
  };
}

/** @param {Record<string, unknown>} item @param {string} path @param {'case'|'topic'} kind */
function parseQuestion(item, path, kind) {
  assertAllowedKeys(item, ['id', 'operation', 'applicationId', kind === 'case' ? 'caseId' : 'topicId', 'questionPromptId', 'answerMd', 'inheritToDescendants', 'isActive'], path);
  const op = operation(item, path, RELATION_OPERATIONS);
  const owner = packageReference(item[kind === 'case' ? 'caseId' : 'topicId'], `${path}.${kind === 'case' ? 'caseId' : 'topicId'}`);
  const promptId = packageReference(item.questionPromptId, `${path}.questionPromptId`);
  if (op === 'create') requiredString(item.answerMd, `${path}.answerMd`);
  if (kind === 'topic' && item.inheritToDescendants !== undefined && typeof item.inheritToDescendants !== 'boolean') throw new ContentPackageError(`${path}.inheritToDescendants must be boolean.`);
  return {
    id: packageEntityId(item, path), operation: op,
    applicationId: item.applicationId ? requiredString(item.applicationId, `${path}.applicationId`) : null,
    owner, questionPromptId: promptId, answerMd: item.answerMd === undefined ? null : requiredString(item.answerMd, `${path}.answerMd`),
    inheritToDescendants: item.inheritToDescendants === true, isActive: optionalBoolean(item.isActive, `${path}.isActive`)
  };
}

/** @param {Record<string, unknown>} item @param {string} path */
function parseCaseAsset(item, path) {
  assertAllowedKeys(item, ['id', 'operation', 'applicationId', 'caseId', 'assetId', 'displayOrder', 'captionMd'], path);
  const op = operation(item, path, RELATION_OPERATIONS);
  const displayOrder = Number(item.displayOrder);
  if (!Number.isInteger(displayOrder) || displayOrder < 0) throw new ContentPackageError(`${path}.displayOrder must be a non-negative integer.`);
  return {
    id: packageEntityId(item, path), operation: op,
    applicationId: item.applicationId ? requiredString(item.applicationId, `${path}.applicationId`) : null,
    caseId: packageReference(item.caseId, `${path}.caseId`), assetId: packageReference(item.assetId, `${path}.assetId`), displayOrder,
    captionMd: optionalString(item.captionMd, `${path}.captionMd`)
  };
}

/** @param {unknown} value */
function parseManifest(value) {
  const root = objectValue(value, 'manifest');
  assertAllowedKeys(root, ['version', 'packageId', ...ENTITY_COLLECTIONS], 'manifest');
  if (root.version !== IMPORT_PACKAGE_VERSION) throw new ContentPackageError(`Unsupported import manifest version: ${String(root.version)}.`);
  const packageId = requiredString(root.packageId, 'manifest.packageId');
  if (!PACKAGE_ID_PATTERN.test(packageId)) throw new ContentPackageError('manifest.packageId contains unsupported characters.');
  /** @type {any} */
  const manifest = { version: 1, packageId, topics: [], cases: [], assets: [], caseAssets: [], questionPrompts: [], caseQuestions: [], topicQuestions: [] };
  for (const collection of ENTITY_COLLECTIONS) {
    const entries = arrayValue(root[collection], `manifest.${collection}`);
    manifest[collection] = entries.map((item, index) => {
      const path = `manifest.${collection}[${index}]`;
      if (collection === 'topics') return parseTopic(item, path);
      if (collection === 'cases') return parseCase(item, path);
      if (collection === 'assets') return parseAsset(item, path);
      if (collection === 'questionPrompts') return parsePrompt(item, path);
      if (collection === 'caseAssets') return parseCaseAsset(item, path);
      return parseQuestion(item, path, collection === 'caseQuestions' ? 'case' : 'topic');
    });
  }
  const ids = new Set();
  for (const collection of ENTITY_COLLECTIONS) for (const entity of manifest[collection]) {
    if (ids.has(entity.id)) throw new ContentPackageError(`Duplicate package-local identifier: ${entity.id}.`);
    ids.add(entity.id);
  }
  return manifest;
}

/** @param {Uint8Array} bytes @param {number} offset */
function u16(bytes, offset) { return bytes[offset] | (bytes[offset + 1] << 8); }
/** @param {Uint8Array} bytes @param {number} offset */
function u32(bytes, offset) { return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0; }

/** @param {Uint8Array} bytes @returns {number} */
function findEndOfCentralDirectory(bytes) {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) if (u32(bytes, offset) === 0x06054b50) return offset;
  throw new ContentPackageError('ZIP end-of-central-directory record is missing.');
}

/** @param {Uint8Array} bytes @param {number} start @param {number} length @param {string} path */
function decodeUtf8(bytes, start, length, path) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(start, start + length)); }
  catch { throw new ContentPackageError(`${path} is not valid UTF-8.`); }
}

/** @param {string} path */
function assertSafeArchivePath(path) {
  if (!path || path.includes('\\') || path.includes('\0') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) throw new ContentPackageError(`Unsafe ZIP path: ${path}.`);
  const parts = path.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new ContentPackageError(`Unsafe ZIP path: ${path}.`);
  if (path !== 'manifest.json' && !path.startsWith('media/')) throw new ContentPackageError(`Unexpected ZIP path: ${path}.`);
}

/** @param {Uint8Array} bytes @returns {Promise<Uint8Array>} */
async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new ContentPackageError('This runtime cannot decompress deflated ZIP entries.');
  const safeBytes = /** @type {ArrayBuffer} */ (bytes.slice().buffer);
  const stream = new Blob([safeBytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {Uint8Array} bytes @param {number} offset @returns {Promise<{ path: string, bytes: Uint8Array }>} */
async function readZipEntry(bytes, offset) {
  if (u32(bytes, offset) !== 0x04034b50) throw new ContentPackageError('ZIP entry has an invalid local header.');
  const flags = u16(bytes, offset + 6);
  const method = u16(bytes, offset + 8);
  const compressedSize = u32(bytes, offset + 18);
  const nameLength = u16(bytes, offset + 26);
  const extraLength = u16(bytes, offset + 28);
  if (flags & 1) throw new ContentPackageError('Encrypted ZIP entries are not supported.');
  if (flags & 8) throw new ContentPackageError('ZIP data descriptors are not supported; regenerate the package with a standard ZIP writer.');
  const path = decodeUtf8(bytes, offset + 30, nameLength, 'ZIP filename');
  assertSafeArchivePath(path);
  const start = offset + 30 + nameLength + extraLength;
  const end = start + compressedSize;
  if (end > bytes.length) throw new ContentPackageError(`ZIP entry is truncated: ${path}.`);
  const stored = bytes.slice(start, end);
  const entryBytes = method === 0 ? stored : method === 8 ? await inflateRaw(stored) : null;
  if (!entryBytes) throw new ContentPackageError(`ZIP compression method ${method} is not supported.`);
  return { path, bytes: entryBytes };
}

/** @param {ArrayBuffer | Uint8Array | Blob} input @returns {Promise<any>} */
export async function parseImportPackage(input) {
  const bytes = input instanceof Uint8Array ? input : input instanceof ArrayBuffer ? new Uint8Array(input) : new Uint8Array(await input.arrayBuffer());
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new ContentPackageError(`ZIP package exceeds the ${MAX_ARCHIVE_BYTES}-byte compressed limit.`);
  const eocd = findEndOfCentralDirectory(bytes);
  const count = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralOffset = u32(bytes, eocd + 16);
  if (count > MAX_ARCHIVE_ENTRIES) throw new ContentPackageError(`ZIP package contains more than ${MAX_ARCHIVE_ENTRIES} entries.`);
  if (centralOffset + centralSize > bytes.length) throw new ContentPackageError('ZIP central directory is truncated.');
  const entries = [];
  const paths = new Set();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (u32(bytes, cursor) !== 0x02014b50) throw new ContentPackageError('ZIP central directory entry is invalid.');
    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const compressedSize = u32(bytes, cursor + 20);
    const uncompressedSize = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const localOffset = u32(bytes, cursor + 42);
    const path = decodeUtf8(bytes, cursor + 46, nameLength, 'ZIP filename');
    assertSafeArchivePath(path);
    if (paths.has(path)) throw new ContentPackageError(`Duplicate ZIP entry: ${path}.`);
    paths.add(path);
    if (flags & 1 || flags & 8) throw new ContentPackageError(`Unsupported flags on ZIP entry: ${path}.`);
    if (uncompressedSize > MAX_UNCOMPRESSED_BYTES || compressedSize > MAX_ARCHIVE_BYTES) throw new ContentPackageError(`ZIP entry is too large: ${path}.`);
    entries.push({ path, method, compressedSize, uncompressedSize, localOffset });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  if (cursor > centralOffset + centralSize) throw new ContentPackageError('ZIP central directory length is inconsistent.');
  const files = new Map();
  let totalUncompressed = 0;
  for (const entry of entries) {
    const result = await readZipEntry(bytes, entry.localOffset);
    if (result.path !== entry.path) throw new ContentPackageError(`ZIP local and central filenames differ for ${entry.path}.`);
    if (result.bytes.byteLength !== entry.uncompressedSize) throw new ContentPackageError(`ZIP entry size mismatch: ${entry.path}.`);
    totalUncompressed += result.bytes.byteLength;
    if (totalUncompressed > MAX_UNCOMPRESSED_BYTES) throw new ContentPackageError(`ZIP package exceeds the ${MAX_UNCOMPRESSED_BYTES}-byte decompressed limit.`);
    files.set(result.path, result.bytes);
  }
  const manifestBytes = files.get('manifest.json');
  if (!manifestBytes) throw new ContentPackageError('ZIP package must contain manifest.json.');
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) throw new ContentPackageError('manifest.json is too large.');
  let parsedJson;
  try { parsedJson = JSON.parse(decodeUtf8(manifestBytes, 0, manifestBytes.length, 'manifest.json')); }
  catch (error) {
    if (error instanceof ContentPackageError) throw error;
    throw new ContentPackageError('manifest.json is malformed JSON.');
  }
  const manifest = parseManifest(parsedJson);
  const media = new Map();
  for (const [path, fileBytes] of files) if (path.startsWith('media/')) media.set(path, { bytes: fileBytes, size: fileBytes.byteLength });
  const declared = new Set();
  for (const asset of manifest.assets) if (asset.operation === 'create') {
    if (!asset.path.startsWith('media/')) throw new ContentPackageError(`Asset ${asset.id} must reference a media/ path.`);
    if (declared.has(asset.path)) throw new ContentPackageError(`Media path is declared more than once: ${asset.path}.`);
    declared.add(asset.path);
    if (!media.has(asset.path)) throw new ContentPackageError(`Manifest-declared media is missing: ${asset.path}.`);
  }
  for (const path of media.keys()) if (!declared.has(path)) throw new ContentPackageError(`Unexpected undeclared media file: ${path}.`);
  for (const asset of manifest.assets) if (asset.operation === 'create') {
    const bytesForAsset = media.get(asset.path).bytes;
    if (bytesForAsset.byteLength > MAX_IMAGE_BYTES) throw new ContentPackageError(`Media ${asset.path} exceeds the ${MAX_IMAGE_BYTES}-byte individual image limit.`);
    const detected = detectImageType(bytesForAsset);
    if (detected !== asset.mimeType) throw new ContentPackageError(`Media ${asset.path} does not match its declared MIME type.`);
  }
  return { manifest, media };
}

/** @param {Uint8Array} bytes @returns {string | null} */
function detectImageType(bytes) {
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 2] === 0xff && bytes[bytes.length - 1] === 0xd9) return 'image/jpeg';
  return null;
}

/** @param {string} packageId @param {string} collection @param {string} id */
export function deterministicApplicationId(packageId, collection, id) {
  return `fc-import:${packageId}:${collection}:${id}`;
}

/** @param {string} packageId @param {string} id @param {string} mimeType */
export function deterministicStorageKey(packageId, id, mimeType) {
  return `teaching-images/import/${encodeURIComponent(packageId)}/${encodeURIComponent(id)}.${mimeType === 'image/png' ? 'png' : 'jpg'}`;
}

/** @param {any} db @param {any} table @param {string} id */
async function rowById(db, table, id) {
  return (await db.select().from(table).where(eq(table.id, id)).limit(1))[0] ?? null;
}

/** @param {any} db @param {any} table @param {string} id @param {string} label @param {string[]} issues */
async function requireExisting(db, table, id, label, issues) {
  const row = await rowById(db, table, id);
  if (!row) issues.push(`${label} references missing application ID ${id}.`);
  return row;
}

/** @param {any} row @param {Record<string, unknown>} expected */
function fieldsMatch(row, expected) {
  return Object.entries(expected).every(([key, value]) => row[key] === value);
}

/** @param {any} parsed @returns {string[]} */
function validatePackageReferences(parsed) {
  const issues = [];
  const sets = Object.fromEntries(ENTITY_COLLECTIONS.map((name) => [name, new Set(parsed.manifest[name].map((/** @param {any} item */ item) => item.id))]));
  for (const topic of parsed.manifest.topics) if (topic.parentTopicId && !sets.topics.has(topic.parentTopicId)) issues.push(`Topic ${topic.id} references missing parent Topic ${topic.parentTopicId}.`);
  for (const item of parsed.manifest.cases) {
    if (item.primaryTopicId && !sets.topics.has(item.primaryTopicId)) issues.push(`Case ${item.id} references missing primary Topic ${item.primaryTopicId}.`);
    for (const id of item.secondaryTopicIds) if (!sets.topics.has(id)) issues.push(`Case ${item.id} references missing secondary Topic ${id}.`);
  }
  for (const item of parsed.manifest.caseAssets) {
    if (!sets.cases.has(item.caseId)) issues.push(`Case Asset ${item.id} references missing Case ${item.caseId}.`);
    if (!sets.assets.has(item.assetId)) issues.push(`Case Asset ${item.id} references missing Asset ${item.assetId}.`);
  }
  for (const item of parsed.manifest.caseQuestions) {
    if (!sets.cases.has(item.owner)) issues.push(`Case Question ${item.id} references missing Case ${item.owner}.`);
    if (!sets.questionPrompts.has(item.questionPromptId)) issues.push(`Case Question ${item.id} references missing Question Prompt ${item.questionPromptId}.`);
  }
  for (const item of parsed.manifest.topicQuestions) {
    if (!sets.topics.has(item.owner)) issues.push(`Topic Question ${item.id} references missing Topic ${item.owner}.`);
    if (!sets.questionPrompts.has(item.questionPromptId)) issues.push(`Topic Question ${item.id} references missing Question Prompt ${item.questionPromptId}.`);
  }
  const visiting = new Set();
  const visited = new Set();
  const topicMap = new Map(parsed.manifest.topics.map((/** @param {any} item */ item) => [item.id, item]));
  /** @param {string} id */
  function visit(id) {
    if (visiting.has(id)) issues.push(`Topic parent relationship contains a cycle at ${id}.`);
    if (visited.has(id)) return;
    visiting.add(id);
    const parent = topicMap.get(id)?.parentTopicId;
    if (parent && topicMap.has(parent)) visit(parent);
    visiting.delete(id); visited.add(id);
  }
  for (const topic of parsed.manifest.topics) visit(topic.id);
  return issues;
}

/** @param {any} parsed @returns {any} */
function previewFor(parsed) {
  /** @param {string} collection @param {string} operation */
  const count = (collection, operation) => parsed.manifest[collection].filter((/** @param {any} item */ item) => item.operation === operation).length;
  return {
    topics: { create: count('topics', 'create'), use: count('topics', 'use'), skip: count('topics', 'skip') },
    cases: { create: count('cases', 'create'), use: count('cases', 'use'), skip: count('cases', 'skip') },
    imagesToUpload: parsed.manifest.assets.filter((/** @param {any} item */ item) => item.operation === 'create').length,
    assets: { create: count('assets', 'create'), use: count('assets', 'use'), skip: count('assets', 'skip') },
    questionPrompts: parsed.manifest.questionPrompts.length,
    caseQuestions: parsed.manifest.caseQuestions.filter((/** @param {any} item */ item) => item.operation !== 'skip').length,
    topicQuestions: parsed.manifest.topicQuestions.filter((/** @param {any} item */ item) => item.operation !== 'skip').length,
    primaryTopicLinks: parsed.manifest.cases.filter((/** @param {any} item */ item) => item.operation !== 'skip' && item.primaryTopicId).length,
    secondaryTopicLinks: parsed.manifest.cases.filter((/** @param {any} item */ item) => item.operation !== 'skip').reduce((/** @param {number} total @param {any} item */ total, item) => total + item.secondaryTopicIds.length, 0),
    caseAssetLinks: parsed.manifest.caseAssets.filter((/** @param {any} item */ item) => item.operation !== 'skip').length
  };
}

/** @param {any} parsed @param {any} db @returns {Promise<any>} */
export async function validateImportPackage(db, parsed) {
  const issues = [...validatePackageReferences(parsed)];
  const resolved = { topics: new Map(), cases: new Map(), assets: new Map(), questionPrompts: new Map(), caseQuestions: new Map(), topicQuestions: new Map() };
  const manifest = /** @type {any} */ (parsed.manifest);
  const topicById = new Map(manifest.topics.map((/** @param {any} item */ item) => [item.id, item]));

  for (const item of manifest.topics) {
    const appId = item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'topic', item.id) : item.applicationId;
    const row = item.operation === 'create' ? await rowById(db, concepts, appId) : await requireExisting(db, concepts, appId, `Topic ${item.id}`, issues);
    const parentTopic = item.parentTopicId ? topicById.get(item.parentTopicId) : null;
    const expectedParentId = parentTopic ? parentTopic.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'topic', parentTopic.id) : parentTopic.applicationId : null;
    if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, name: item.name, slug: item.slug, descriptionMd: item.descriptionMd, parentId: expectedParentId, isActive: item.isActive })) issues.push(`Topic ${item.id} conflicts with an existing application row.`);
    if (item.operation === 'use' && row === null) continue;
    resolved.topics.set(item.id, appId);
  }
  for (const item of manifest.cases) {
    const appId = item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'case', item.id) : item.applicationId;
    const row = item.operation === 'create' ? await rowById(db, cases, appId) : await requireExisting(db, cases, appId, `Case ${item.id}`, issues);
    if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, title: item.title, vignetteMd: item.vignetteMd, questionSelectionMode: item.questionSelectionMode, questionCount: item.questionCount, isActive: item.isActive })) issues.push(`Case ${item.id} conflicts with an existing application row.`);
    resolved.cases.set(item.id, appId);
    if (item.operation !== 'skip' && item.primaryTopicId && !resolved.topics.has(item.primaryTopicId)) issues.push(`Case ${item.id} cannot resolve its primary Topic.`);
  }
  for (const item of manifest.assets) {
    const appId = item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'asset', item.id) : item.applicationId;
    const row = item.operation === 'create' ? await rowById(db, assets, appId) : await requireExisting(db, assets, appId, `Asset ${item.id}`, issues);
    if (row && row.type !== 'image') issues.push(`Asset ${item.id} application ID ${appId} is not an image Asset.`);
    if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, mimeType: item.mimeType, altText: item.altText, originalFilename: item.originalFilename, sourceLabel: item.sourceLabel, sourceUrl: item.sourceUrl, licence: item.licence, isActive: item.isActive })) issues.push(`Asset ${item.id} conflicts with an existing application row.`);
    resolved.assets.set(item.id, appId);
  }
  for (const item of manifest.questionPrompts) {
    const appId = item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'prompt', item.id) : item.applicationId;
    const row = item.operation === 'create' ? await rowById(db, questionPrompts, appId) : await requireExisting(db, questionPrompts, appId, `Question Prompt ${item.id}`, issues);
    if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, promptMd: item.promptMd, isActive: item.isActive })) issues.push(`Question Prompt ${item.id} conflicts with an existing application row.`);
    resolved.questionPrompts.set(item.id, appId);
  }
  for (const item of manifest.caseAssets) {
    if (!resolved.cases.has(item.caseId) || !resolved.assets.has(item.assetId)) continue;
    const caseId = resolved.cases.get(item.caseId);
    const assetId = resolved.assets.get(item.assetId);
    const existingRows = await db.select().from(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId))).limit(1);
    const existing = existingRows[0] ?? null;
    if (item.operation === 'use' && !existing) issues.push(`Case Asset ${item.id} is marked use but the relationship does not exist.`);
    if (item.operation === 'create' && existing && !fieldsMatch(existing, { displayOrder: item.displayOrder, captionMd: item.captionMd })) issues.push(`Case Asset ${item.id} conflicts with an existing relationship.`);
  }
  for (const item of manifest.caseQuestions) {
    if (!resolved.cases.has(item.owner) || !resolved.questionPrompts.has(item.questionPromptId)) continue;
    const appId = item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'case-question', item.id) : item.applicationId;
    const row = item.operation === 'create' ? await rowById(db, caseQuestions, appId) : await requireExisting(db, caseQuestions, appId, `Case Question ${item.id}`, issues);
    if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, caseId: resolved.cases.get(item.owner), questionPromptId: resolved.questionPrompts.get(item.questionPromptId), answerMd: item.answerMd, isActive: item.isActive })) issues.push(`Case Question ${item.id} conflicts with an existing application row.`);
    resolved.caseQuestions.set(item.id, appId);
  }
  for (const item of manifest.topicQuestions) {
    if (!resolved.topics.has(item.owner) || !resolved.questionPrompts.has(item.questionPromptId)) continue;
    const appId = item.operation === 'create' ? deterministicApplicationId(manifest.packageId, 'topic-question', item.id) : item.applicationId;
    const row = item.operation === 'create' ? await rowById(db, conceptQuestions, appId) : await requireExisting(db, conceptQuestions, appId, `Topic Question ${item.id}`, issues);
    if (item.operation === 'create' && row && !fieldsMatch(row, { id: appId, conceptId: resolved.topics.get(item.owner), questionPromptId: resolved.questionPrompts.get(item.questionPromptId), answerMd: item.answerMd, inheritToDescendants: item.inheritToDescendants, isActive: item.isActive })) issues.push(`Topic Question ${item.id} conflicts with an existing application row.`);
    resolved.topicQuestions.set(item.id, appId);
  }
  for (const item of manifest.cases) if (item.operation !== 'skip' && item.primaryTopicId && resolved.cases.has(item.id) && resolved.topics.has(item.primaryTopicId)) {
    const caseId = resolved.cases.get(item.id);
    const links = await db.select().from(caseConcepts).where(eq(caseConcepts.caseId, caseId));
    const wanted = [{ conceptId: resolved.topics.get(item.primaryTopicId), role: 'primary' }, ...item.secondaryTopicIds.filter((/** @param {string} id */ id) => resolved.topics.has(id)).map((/** @param {string} id */ id) => ({ conceptId: resolved.topics.get(id), role: 'secondary' }))];
    if (item.operation === 'use' && wanted.some((/** @param {any} wantedLink */ wantedLink) => !links.some((/** @param {any} link */ link) => link.conceptId === wantedLink.conceptId && link.role === wantedLink.role))) issues.push(`Existing Case ${item.id} does not have the explicitly requested Topic relationships.`);
  }
  return { valid: issues.length === 0, errors: issues, warnings: [], preview: previewFor(parsed), plan: issues.length ? null : { parsed, resolved } };
}

/** @param {any} db @param {any} bucket @param {any} validation @returns {Promise<any>} */
export async function importContentPackage(db, bucket, validation) {
  if (!validation?.valid || !validation.plan) throw new ContentPackageError('The package must pass validation before import.');
  const { parsed, resolved } = validation.plan;
  const manifest = parsed.manifest;
  const uploadedKeys = [];
  try {
    for (const asset of manifest.assets) if (asset.operation === 'create') {
      const appId = resolved.assets.get(asset.id);
      const existing = await rowById(db, assets, appId);
      if (existing) continue;
      const media = parsed.media.get(asset.path);
      const key = deterministicStorageKey(manifest.packageId, asset.id, asset.mimeType);
      await putTeachingImage(bucket, key, new Blob([media.bytes], { type: asset.mimeType }));
      uploadedKeys.push(key);
    }
    const statements = [];
    for (const topic of manifest.topics) if (topic.operation === 'create' && !(await rowById(db, concepts, resolved.topics.get(topic.id)))) statements.push(db.insert(concepts).values({ id: resolved.topics.get(topic.id), name: topic.name, slug: topic.slug, descriptionMd: topic.descriptionMd, parentId: topic.parentTopicId ? resolved.topics.get(topic.parentTopicId) : null, isActive: topic.isActive }));
    for (const item of manifest.questionPrompts) if (item.operation === 'create' && !(await rowById(db, questionPrompts, resolved.questionPrompts.get(item.id)))) statements.push(db.insert(questionPrompts).values({ id: resolved.questionPrompts.get(item.id), promptMd: item.promptMd, isActive: item.isActive }));
    for (const item of manifest.cases) if (item.operation === 'create' && !(await rowById(db, cases, resolved.cases.get(item.id)))) statements.push(db.insert(cases).values({ id: resolved.cases.get(item.id), title: item.title, vignetteMd: item.vignetteMd, questionSelectionMode: item.questionSelectionMode, questionCount: item.questionCount, isActive: item.isActive }));
    for (const item of manifest.assets) if (item.operation === 'create' && !(await rowById(db, assets, resolved.assets.get(item.id)))) statements.push(db.insert(assets).values({ id: resolved.assets.get(item.id), type: 'image', storageKey: deterministicStorageKey(manifest.packageId, item.id, item.mimeType), mimeType: item.mimeType, originalFilename: item.originalFilename, altText: item.altText, sourceLabel: item.sourceLabel, sourceUrl: item.sourceUrl, licence: item.licence, isActive: item.isActive }));
    for (const item of manifest.cases) if (item.operation !== 'skip' && item.operation === 'create') {
      const caseId = resolved.cases.get(item.id);
      const existingLinks = await db.select().from(caseConcepts).where(eq(caseConcepts.caseId, caseId));
      const desiredLinks = [{ conceptId: resolved.topics.get(item.primaryTopicId), role: 'primary' }, ...item.secondaryTopicIds.map((/** @param {string} topicId */ topicId) => ({ conceptId: resolved.topics.get(topicId), role: 'secondary' }))];
      for (const link of desiredLinks) if (!existingLinks.some((/** @param {any} existingLink */ existingLink) => existingLink.conceptId === link.conceptId)) statements.push(db.insert(caseConcepts).values({ caseId, conceptId: link.conceptId, role: link.role }));
    }
    for (const item of manifest.caseAssets) if (item.operation === 'create') {
      const caseId = resolved.cases.get(item.caseId);
      const assetId = resolved.assets.get(item.assetId);
      const existingRows = await db.select().from(caseAssets).where(and(eq(caseAssets.caseId, caseId), eq(caseAssets.assetId, assetId))).limit(1);
      const existing = existingRows[0];
      if (!existing) statements.push(db.insert(caseAssets).values({ caseId: resolved.cases.get(item.caseId), assetId: resolved.assets.get(item.assetId), displayOrder: item.displayOrder, captionMd: item.captionMd }));
    }
    for (const item of manifest.caseQuestions) if (item.operation === 'create' && !(await rowById(db, caseQuestions, resolved.caseQuestions.get(item.id)))) statements.push(db.insert(caseQuestions).values({ id: resolved.caseQuestions.get(item.id), caseId: resolved.cases.get(item.owner), questionPromptId: resolved.questionPrompts.get(item.questionPromptId), answerMd: item.answerMd, isActive: item.isActive }));
    for (const item of manifest.topicQuestions) if (item.operation === 'create' && !(await rowById(db, conceptQuestions, resolved.topicQuestions.get(item.id)))) statements.push(db.insert(conceptQuestions).values({ id: resolved.topicQuestions.get(item.id), conceptId: resolved.topics.get(item.owner), questionPromptId: resolved.questionPrompts.get(item.questionPromptId), answerMd: item.answerMd, inheritToDescendants: item.inheritToDescendants, isActive: item.isActive }));
    if (statements.length) {
      if (typeof db.batch === 'function') await db.batch(statements);
      else for (const statement of statements) await statement;
    }
    return { packageId: manifest.packageId, uploadedImages: uploadedKeys.length, preview: validation.preview, created: statements.length };
  } catch (error) {
    for (const key of uploadedKeys) {
      try { await deleteTeachingImage(bucket, key); }
      catch (cleanupError) { console.error('Unable to clean up imported teaching image.', { key, cleanupError }); }
    }
    throw error;
  }
}

/** @param {string} mimeType */
export function validateImportMimeType(mimeType) { assertSupportedImageType(mimeType); return mimeType; }
