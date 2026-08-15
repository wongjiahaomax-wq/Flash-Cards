// Focused regression coverage for the final reviewed-package safety contract.
// @ts-nocheck

import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

import {
  ContentPackageError,
  parseImportPackage,
  validateImportPackage
} from '../src/lib/server/import/reviewed-content-package.js';
import { MAX_IMAGE_BYTES } from '../src/lib/server/storage/media.js';

function concat(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function bytes(value) {
  return typeof value === 'string' ? new TextEncoder().encode(value) : value;
}

function zip(entries) {
  const encoder = new TextEncoder();
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const raw = bytes(entry.body);
    const method = entry.deflate ? 8 : 0;
    const compressed = entry.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const declaredUncompressedSize = entry.declaredUncompressedSize ?? raw.length;

    const local = new Uint8Array(30 + name.length + compressed.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0, true);
    localView.setUint16(8, method, true);
    localView.setUint32(14, 0, true);
    localView.setUint32(18, compressed.length, true);
    localView.setUint32(22, declaredUncompressedSize, true);
    localView.setUint16(26, name.length, true);
    localView.setUint16(28, 0, true);
    local.set(name, 30);
    local.set(compressed, 30 + name.length);
    localChunks.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0, true);
    centralView.setUint16(10, method, true);
    centralView.setUint32(16, 0, true);
    centralView.setUint32(20, compressed.length, true);
    centralView.setUint32(24, declaredUncompressedSize, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centralChunks.push(central);
    offset += local.length;
  }

  const centralBytes = concat(centralChunks);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralBytes.length, true);
  endView.setUint32(16, offset, true);
  return concat([...localChunks, centralBytes, end]);
}

function manifest(overrides = {}) {
  return {
    version: 1,
    packageId: 'safety-contract-test',
    topics: [],
    cases: [],
    assets: [],
    caseAssets: [],
    questionPrompts: [],
    caseQuestions: [],
    topicQuestions: [],
    ...overrides
  };
}

test('hardened preflight rejects an oversized individual media entry before materialization', async () => {
  const payload = manifest({
    assets: [{
      id: 'asset-one',
      operation: 'create',
      path: 'media/ecg.png',
      mimeType: 'image/png',
      altText: 'Reviewed ECG'
    }]
  });

  const archive = zip([
    { path: 'manifest.json', body: JSON.stringify(payload) },
    {
      path: 'media/ecg.png',
      body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      deflate: true,
      declaredUncompressedSize: MAX_IMAGE_BYTES + 1
    }
  ]);

  await assert.rejects(
    () => parseImportPackage(archive),
    (error) => error instanceof ContentPackageError && /individual image limit/i.test(error.message)
  );
});

test('non-skipped content cannot write through a skipped package object', async () => {
  const payload = manifest({
    cases: [{ id: 'existing-case', operation: 'skip', applicationId: 'case-production-id' }],
    questionPrompts: [{ id: 'prompt-one', operation: 'create', promptMd: 'What is the diagnosis?' }],
    caseQuestions: [{
      id: 'question-one',
      operation: 'create',
      caseId: 'existing-case',
      questionPromptId: 'prompt-one',
      answerMd: 'Reviewed answer'
    }]
  });

  const parsed = await parseImportPackage(zip([
    { path: 'manifest.json', body: JSON.stringify(payload) }
  ]));
  const validation = await validateImportPackage({}, parsed);

  assert.equal(validation.valid, false);
  assert.match(validation.errors.join('\n'), /references skipped Case existing-case/i);
  assert.match(validation.errors.join('\n'), /mark the Case use/i);
});
