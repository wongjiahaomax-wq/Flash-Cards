// @ts-nocheck

const MAX_ARCHIVE_BYTES = 25 * 1024 * 1024;
const MAX_UNCOMPRESSED_BYTES = 40 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES = 256;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function bytesOf(input) {
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return new Uint8Array(input);
}

function u16(bytes, offset) {
  if (offset < 0 || offset + 2 > bytes.length) throw new Error('ZIP structure is truncated.');
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function u32(bytes, offset) {
  if (offset < 0 || offset + 4 > bytes.length) throw new Error('ZIP structure is truncated.');
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0;
}

function eocdOffset(bytes) {
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset -= 1) {
    if (u32(bytes, offset) === 0x06054b50) return offset;
  }
  throw new Error('ZIP end-of-central-directory record is missing.');
}

function pathAt(bytes, offset, length) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes.slice(offset, offset + length));
  } catch {
    throw new Error('ZIP filename is not valid UTF-8.');
  }
}

async function inflate(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot display deflated ZIP media.');
  const stream = new Blob([bytes.slice().buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Display-only ZIP extraction. It indexes central-directory metadata, then
 * materializes only the exact declared paths requested by the preview model.
 * It is deliberately not a package validator; server preview remains the
 * acceptance authority.
 * @param {ArrayBuffer|Uint8Array} input
 * @param {Iterable<string>} requestedPaths
 */
export async function extractDeclaredZipMedia(input, requestedPaths) {
  const bytes = bytesOf(input);
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) throw new Error('ZIP is too large to display safely.');
  const requested = [...new Set(requestedPaths)].filter((path) => typeof path === 'string' && path.startsWith('media/'));
  const wanted = new Set(requested);
  const eocd = eocdOffset(bytes);
  const count = u16(bytes, eocd + 10);
  const centralSize = u32(bytes, eocd + 12);
  const centralOffset = u32(bytes, eocd + 16);
  if (count > MAX_ARCHIVE_ENTRIES || centralOffset + centralSize > eocd) throw new Error('ZIP central directory is outside the validated package bounds.');

  const entries = new Map();
  let cursor = centralOffset;
  for (let index = 0; index < count; index += 1) {
    if (u32(bytes, cursor) !== 0x02014b50) throw new Error('ZIP central directory entry is invalid.');
    const flags = u16(bytes, cursor + 8);
    const method = u16(bytes, cursor + 10);
    const compressedSize = u32(bytes, cursor + 20);
    const uncompressedSize = u32(bytes, cursor + 24);
    const nameLength = u16(bytes, cursor + 28);
    const extraLength = u16(bytes, cursor + 30);
    const commentLength = u16(bytes, cursor + 32);
    const localOffset = u32(bytes, cursor + 42);
    const recordLength = 46 + nameLength + extraLength + commentLength;
    if (cursor + recordLength > eocd) throw new Error('ZIP central directory entry is truncated.');
    const path = pathAt(bytes, cursor + 46, nameLength);
    if (wanted.has(path)) entries.set(path, { flags, method, compressedSize, uncompressedSize, localOffset });
    cursor += recordLength;
  }
  if (cursor !== centralOffset + centralSize) throw new Error('ZIP central directory length is inconsistent.');
  if (entries.size !== wanted.size) throw new Error('A declared create-Asset media path is missing from the selected ZIP.');

  const media = new Map();
  let total = 0;
  for (const path of requested) {
    const entry = entries.get(path);
    if (entry.flags & 1 || entry.flags & 8 || ![0, 8].includes(entry.method)) throw new Error(`ZIP media ${path} uses an unsupported encoding.`);
    if (entry.uncompressedSize > MAX_IMAGE_BYTES || entry.uncompressedSize > MAX_UNCOMPRESSED_BYTES) throw new Error(`ZIP media ${path} exceeds the validated image limit.`);
    const offset = entry.localOffset;
    if (u32(bytes, offset) !== 0x04034b50) throw new Error(`ZIP local header is invalid for ${path}.`);
    const localFlags = u16(bytes, offset + 6);
    const localMethod = u16(bytes, offset + 8);
    const localCompressedSize = u32(bytes, offset + 18);
    const localUncompressedSize = u32(bytes, offset + 22);
    const nameLength = u16(bytes, offset + 26);
    const extraLength = u16(bytes, offset + 28);
    const headerLength = 30 + nameLength + extraLength;
    if (localFlags !== entry.flags || localMethod !== entry.method || localCompressedSize !== entry.compressedSize || localUncompressedSize !== entry.uncompressedSize) throw new Error(`ZIP metadata differs for ${path}.`);
    if (pathAt(bytes, offset + 30, nameLength) !== path) throw new Error(`ZIP local and central filenames differ for ${path}.`);
    const start = offset + headerLength;
    const end = start + entry.compressedSize;
    if (end > centralOffset || end > bytes.length) throw new Error(`ZIP media is truncated for ${path}.`);
    const compressed = bytes.slice(start, end);
    const body = entry.method === 0 ? compressed : await inflate(compressed);
    if (body.byteLength !== entry.uncompressedSize) throw new Error(`ZIP media size mismatch for ${path}.`);
    total += body.byteLength;
    if (total > MAX_UNCOMPRESSED_BYTES) throw new Error('ZIP media exceeds the validated package bounds.');
    media.set(path, body);
  }
  return media;
}

export async function sha256Hex(input) {
  const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytesOf(input)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createPreviewGenerationFence() {
  let generation = 0;
  return {
    next() { generation += 1; return generation; },
    current() { return generation; },
    isCurrent(value) { return value === generation; }
  };
}
