// Executable coverage for the final package preview contract.
// @ts-nocheck

import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateRawSync } from 'node:zlib';

import { createPreviewGenerationFence, extractDeclaredZipMedia, sha256Hex } from '../src/lib/import-package-preview.js';
import { createImportHistoryState } from '../src/lib/import-history-state.js';
import { buildImportPreviewModel, parseImportPackage } from '../src/lib/server/import/reviewed-content-package.js';

function concat(chunks) {
  const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

function zip(entries) {
  const encoder = new TextEncoder();
  const local = [];
  const central = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = typeof entry.body === 'string' ? encoder.encode(entry.body) : entry.body;
    const method = entry.deflate ? 8 : 0;
    const body = entry.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const name = encoder.encode(entry.path);
    const localEntry = new Uint8Array(30 + name.length + body.length);
    const localView = new DataView(localEntry.buffer);
    localView.setUint32(0, 0x04034b50, true); localView.setUint16(4, 20, true); localView.setUint16(8, method, true);
    localView.setUint32(18, body.length, true); localView.setUint32(22, raw.length, true); localView.setUint16(26, name.length, true);
    localEntry.set(name, 30); localEntry.set(body, 30 + name.length); local.push(localEntry);
    const centralEntry = new Uint8Array(46 + name.length);
    const centralView = new DataView(centralEntry.buffer);
    centralView.setUint32(0, 0x02014b50, true); centralView.setUint16(4, 20, true); centralView.setUint16(6, 20, true); centralView.setUint16(10, method, true);
    centralView.setUint32(20, body.length, true); centralView.setUint32(24, raw.length, true); centralView.setUint16(28, name.length, true); centralView.setUint32(42, offset, true);
    centralEntry.set(name, 46); central.push(centralEntry); offset += localEntry.length;
  }
  const centralBytes = concat(central);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true); endView.setUint16(8, entries.length, true); endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralBytes.length, true); endView.setUint32(16, offset, true);
  return concat([...local, centralBytes, end]);
}

const emptyManifest = (overrides = {}) => ({
  version: 1,
  packageId: 'preview-contract',
  topics: [], cases: [], assets: [], caseAssets: [], questionPrompts: [], caseQuestions: [], topicQuestions: [],
  ...overrides
});

test('presentation model preserves create/use/skip authority and operation-aware Q&A', async () => {
  const manifest = emptyManifest({
    topics: [
      { id: 'parent', operation: 'create', name: 'Package Parent', slug: 'parent', descriptionMd: '<b>literal</b>' },
      { id: 'topic-use', operation: 'use', applicationId: 'prod-topic', name: 'must-not-display', descriptionMd: 'must-not-display' },
      { id: 'topic-owner', operation: 'create', name: 'Owner', slug: 'owner', parentTopicId: 'topic-use' }
    ],
    cases: [
      { id: 'case-create', operation: 'create', title: 'Created Case', vignetteMd: '<img onerror=alert(1)>', primaryTopicId: 'parent', questionSelectionMode: 'all', isActive: false },
      { id: 'case-use', operation: 'use', applicationId: 'prod-case', primaryTopicId: 'topic-use', questionSelectionMode: 'automatic', title: 'must-not-display' },
      { id: 'case-skip', operation: 'skip', applicationId: 'prod-skipped' }
    ],
    assets: [
      { id: 'asset-create', operation: 'create', path: 'media/create.png', mimeType: 'image/png', altText: 'Package image' },
      { id: 'asset-use', operation: 'use', applicationId: 'prod-asset', altText: 'must-not-display' }
    ],
    caseAssets: [
      { id: 'link-use', operation: 'use', applicationId: 'prod-link', caseId: 'case-create', assetId: 'asset-use', displayOrder: 1, captionMd: 'must-not-display' },
      { id: 'link-create', operation: 'create', caseId: 'case-create', assetId: 'asset-create', displayOrder: 0, captionMd: 'Caption\nwith line break' }
    ],
    questionPrompts: [
      { id: 'prompt-create', operation: 'create', promptMd: '<strong>Prompt text</strong>' },
      { id: 'prompt-use', operation: 'use', applicationId: 'prod-prompt', promptMd: 'must-not-display' }
    ],
    caseQuestions: [
      { id: 'cq-create', operation: 'create', caseId: 'case-create', questionPromptId: 'prompt-create', answerMd: '<script>bad</script>', isActive: false },
      { id: 'cq-use-prompt', operation: 'create', caseId: 'case-create', questionPromptId: 'prompt-use', answerMd: 'Authoritative answer' },
      { id: 'cq-use', operation: 'use', applicationId: 'prod-cq', caseId: 'case-use', questionPromptId: 'prompt-use' }
    ],
    topicQuestions: [
      { id: 'tq-create', operation: 'create', topicId: 'topic-owner', questionPromptId: 'prompt-create', answerMd: 'Topic answer', inheritToDescendants: true },
      { id: 'tq-use', operation: 'use', applicationId: 'prod-tq', topicId: 'topic-use', questionPromptId: 'prompt-use' }
    ]
  });
  const parsed = await parseImportPackage(zip([
    { path: 'manifest.json', body: JSON.stringify(manifest) },
    { path: 'media/create.png', body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) }
  ]));
  const model = buildImportPreviewModel(parsed);
  const created = model.cases.find((item) => item.id === 'case-create');
  const reused = model.cases.find((item) => item.id === 'case-use');
  assert.equal(model.cases.some((item) => item.id === 'case-skip'), false);
  assert.equal(created.create.selectionLabel, 'All eligible questions');
  assert.equal(created.create.isActive, false);
  assert.equal(created.primaryTopic.name, 'Package Parent');
  assert.equal(created.assets[0].create.captionMd, 'Caption\nwith line break');
  assert.equal(created.assets[0].asset.mediaPath, 'media/create.png');
  assert.equal(created.assets[0].create.isActive, undefined);
  assert.deepEqual(created.questions[1].prompt, { operation: 'use', applicationId: 'prod-prompt' });
  assert.equal(created.questions[0].create.answerMd, '<script>bad</script>');
  assert.deepEqual(reused.primaryTopic, { operation: 'use', applicationId: 'prod-topic' });
  assert.equal(reused.create, null);
  const topicQuestion = model.topicQuestions.find((item) => item.id === 'tq-create');
  assert.equal(topicQuestion.ownerParentTopic.operation, 'use');
  assert.equal(topicQuestion.create.inheritToDescendants, true);
  assert.deepEqual(model.topicQuestions.find((item) => item.id === 'tq-use').ownerTopic, { operation: 'use', applicationId: 'prod-topic' });
});

test('display-only ZIP helper reads stored and deflated declared media without validating the package', async () => {
  const stored = new Uint8Array([1, 2, 3]);
  const deflated = new Uint8Array([4, 5, 6, 7]);
  const archive = zip([
    { path: 'manifest.json', body: '{}' },
    { path: 'media/stored.png', body: stored },
    { path: 'media/deflated.png', body: deflated, deflate: true },
    { path: 'media/unrelated.png', body: new Uint8Array([9, 9, 9]), deflate: true }
  ]);
  const media = await extractDeclaredZipMedia(archive, ['media/stored.png', 'media/deflated.png']);
  assert.deepEqual([...media.get('media/stored.png')], [...stored]);
  assert.deepEqual([...media.get('media/deflated.png')], [...deflated]);
  assert.equal(media.has('media/unrelated.png'), false);
});

test('generation fencing rejects an older Step-1 response and digest helper binds exact bytes', async () => {
  const fence = createPreviewGenerationFence();
  const first = fence.next();
  const second = fence.next();
  assert.equal(fence.isCurrent(first), false);
  assert.equal(fence.isCurrent(second), true);
  assert.match(await sha256Hex(new Uint8Array([1, 2, 3])), /^[0-9a-f]{64}$/);
});

test('history client state keeps global eligibility, replaces with authoritative backfill, and is independent of preview state', () => {
  const state = createImportHistoryState({ jobs: Array.from({ length: 10 }, (_, index) => ({ id: `job-${index}`, status: 'failed' })), hasEligibleTerminalHistory: false });
  state.upsert({ id: 'job-new', status: 'complete' });
  assert.equal(state.value().hasEligibleTerminalHistory, true);
  state.replace({ jobs: [{ id: 'job-11', status: 'complete' }, { id: 'job-10', status: 'complete' }], hasEligibleTerminalHistory: true });
  assert.deepEqual(state.value().jobs.map((job) => job.id), ['job-11', 'job-10']);
  assert.equal(state.value().hasEligibleTerminalHistory, true);
});

test('Admin preview rendering remains escaped text-only and Step 1 has no staging write path', async () => {
  const { readFile } = await import('node:fs/promises');
  const page = await readFile(new URL('../src/routes/admin/import/+page.svelte', import.meta.url), 'utf8');
  const route = await readFile(new URL('../src/routes/admin/import/+page.server.js', import.meta.url), 'utf8');
  assert.doesNotMatch(page, /\{@html/);
  assert.doesNotMatch(page, /marked|markdown-it|sanitize/i);
  const preview = route.slice(route.indexOf('preview: async'), route.indexOf('start: async'));
  assert.doesNotMatch(preview, /createImportJob|stageImportPackage|platform\.env\.MEDIA/);
});
