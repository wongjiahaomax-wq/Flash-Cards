import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertNonSemanticSourceMap,
  normalizeSourceMap,
  parsePopplerBboxXhtml,
  planChunkRanges,
  sliceSourceMap,
  sourceMapToMarkdown,
} from '../core.mjs';
import { parseArgs } from '../cli.mjs';

test('normalizes PPTX blocks into deterministic visual order with stable IDs', () => {
  const sourceMap = normalizeSourceMap({
    filename: 'Example.pptx',
    type: 'pptx',
    pages: [
      {
        number: 1,
        width: 1000,
        height: 500,
        speakerNotes: '  Teaching note  ',
        blocks: [
          { text: 'Lower', left: 100, top: 300, width: 200, height: 50, fontSize: 20, color: '#ff0000' },
          { text: 'Upper right', left: 500, top: 100, width: 200, height: 50 },
          { text: 'Upper left', left: 100, top: 100, width: 200, height: 50, bold: true },
        ],
      },
    ],
  });

  assert.equal(sourceMap.pages[0].id, 'slide-0001');
  assert.equal(sourceMap.pages[0].label, 'Slide 0001');
  assert.deepEqual(sourceMap.pages[0].blocks.map((block) => block.text), ['Upper left', 'Upper right', 'Lower']);
  assert.deepEqual(sourceMap.pages[0].blocks.map((block) => block.order), [1, 2, 3]);
  assert.deepEqual(sourceMap.pages[0].blocks[0].geometry, { x: 0.1, y: 0.2, width: 0.2, height: 0.1 });
  assert.equal(sourceMap.pages[0].blocks[2].style.color, '#FF0000');
  assert.equal(sourceMap.pages[0].speakerNotes, 'Teaching note');
});

test('uses null rather than invented geometry or style', () => {
  const sourceMap = normalizeSourceMap({
    filename: 'Scan.pdf',
    type: 'pdf',
    pages: [{ number: 1, width: null, height: null, blocks: [{ text: 'Native text' }] }],
  });
  assert.equal(sourceMap.pages[0].blocks[0].geometry, null);
  assert.equal(sourceMap.pages[0].blocks[0].style, null);
  assert.equal(sourceMap.pages[0].speakerNotes, null);
});

test('Markdown is generated from source-map identity and preserves empty markers', () => {
  const sourceMap = normalizeSourceMap({
    filename: 'Example.pptx',
    type: 'pptx',
    pages: [
      { number: 1, width: 100, height: 100, blocks: [], speakerNotes: '' },
      { number: 2, width: 100, height: 100, blocks: [{ text: 'Question text', left: 0, top: 0, width: 50, height: 20 }], speakerNotes: 'Answer note' },
    ],
  });
  const markdown = sourceMapToMarkdown(sourceMap);
  assert.match(markdown, /## Slide 0001/);
  assert.match(markdown, /Source-map id: slide-0001/);
  assert.match(markdown, /\[No straightforward extractable visible text\]/);
  assert.match(markdown, /\[No speaker notes\]/);
  assert.match(markdown, /## Slide 0002[\s\S]*Question text[\s\S]*Answer note/);
});

test('chunk ranges follow the default 50-page threshold and preserve original numbering', () => {
  assert.deepEqual(planChunkRanges(50), []);
  assert.deepEqual(planChunkRanges(81), [
    { start: 1, end: 40 },
    { start: 41, end: 80 },
    { start: 81, end: 81 },
  ]);

  const sourceMap = normalizeSourceMap({
    filename: 'Large.pdf',
    type: 'pdf',
    pages: Array.from({ length: 81 }, (_, index) => ({
      number: index + 1,
      width: 100,
      height: 100,
      blocks: [{ text: `Page ${index + 1}`, left: 0, top: 0, width: 100, height: 10 }],
    })),
  });
  const chunk = sliceSourceMap(sourceMap, 41, 80);
  assert.equal(chunk.pageCount, 40);
  assert.equal(chunk.pages[0].id, 'page-0041');
  assert.equal(chunk.pages.at(-1).id, 'page-0080');
  assert.deepEqual(chunk.source.range, { start: 41, end: 80 });
  assert.equal(chunk.source.originalPageCount, 81);
});

test('parses Poppler bbox XHTML into page-scoped text with geometry', () => {
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?>
  <doc>
    <page width="612" height="792">
      <flow><block xMin="10" yMin="20" xMax="200" yMax="40"><line xMin="10" yMin="20" xMax="200" yMax="40">
        <word xMin="10" yMin="20" xMax="50" yMax="40">Hello</word>
        <word xMin="55" yMin="20" xMax="100" yMax="40">&amp;</word>
        <word xMin="105" yMin="20" xMax="150" yMax="40">world</word>
      </line></block></flow>
    </page>
    <page width="612" height="792"><flow></flow></page>
  </doc>`;

  const pages = parsePopplerBboxXhtml(xhtml);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].blocks[0].text, 'Hello & world');
  assert.equal(pages[0].blocks[0].left, 10);
  assert.equal(pages[0].blocks[0].width, 190);
  assert.deepEqual(pages[1].blocks, []);
});

test('forbids semantic labels in source-map content', () => {
  assert.throws(() => assertNonSemanticSourceMap({ question: true }), /Semantic source-map key is forbidden/);
  assert.doesNotThrow(() => assertNonSemanticSourceMap({ pages: [{ blocks: [{ text: 'What is the diagnosis?' }] }] }));
});

test('CLI parsing remains one-source and bounded', () => {
  assert.deepEqual(parseArgs(['deck.pptx']), {
    help: false,
    sourcePath: 'deck.pptx',
    force: false,
    chunkSize: 40,
  });
  assert.deepEqual(parseArgs(['deck.pdf', '--force', '--chunk-size', '25']), {
    help: false,
    sourcePath: 'deck.pdf',
    force: true,
    chunkSize: 25,
  });
  assert.throws(() => parseArgs(['a.pdf', 'b.pdf']), /exactly one source path/);
  assert.throws(() => parseArgs(['deck.pdf', '--chunk-size', '0']), /positive integer/);
});
