import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assertNonSemanticSourceMap, normalizeSourceMap, parsePopplerBboxXhtml,
  planChunkRanges, sliceSourceMap, sourceMapToMarkdown,
} from '../core.mjs';
import {
  formatFailure, parseArgs, planChunkArtifacts, planPreparation,
  prepareOutputDirectory, withPreparedOutput,
} from '../cli.mjs';

function tempDir() { return mkdtempSync(join(tmpdir(), 'slide-prep-test-')); }

test('normalizes PPTX blocks into deterministic visual order with stable IDs', () => {
  const sourceMap = normalizeSourceMap({
    filename: 'Example.pptx', type: 'pptx', pages: [{
      number: 1, width: 1000, height: 500, speakerNotes: '  Teaching note  ',
      blocks: [
        { text: 'Lower', left: 100, top: 300, width: 200, height: 50, fontSize: 20, color: '#ff0000' },
        { text: 'Upper right', left: 500, top: 100, width: 200, height: 50 },
        { text: 'Upper left', left: 100, top: 100, width: 200, height: 50, bold: true },
      ],
    }],
  });
  assert.equal(sourceMap.pages[0].id, 'slide-0001');
  assert.deepEqual(sourceMap.pages[0].blocks.map((block) => block.text), ['Upper left', 'Upper right', 'Lower']);
  assert.deepEqual(sourceMap.pages[0].blocks.map((block) => block.order), [1, 2, 3]);
  assert.deepEqual(sourceMap.pages[0].blocks[0].geometry, { x: 0.1, y: 0.2, width: 0.2, height: 0.1 });
  assert.equal(sourceMap.pages[0].blocks[2].style.color, '#FF0000');
  assert.equal(sourceMap.pages[0].speakerNotes, 'Teaching note');
});

test('excludes invisible and wholly off-slide blocks while conservatively clipping partial blocks', () => {
  const page = normalizeSourceMap({
    filename: 'Visibility.pptx', type: 'pptx', pages: [{
      number: 1, width: 100, height: 100, speakerNotes: '',
      blocks: [
        { text: 'Invisible', visible: false, left: 10, top: 10, width: 20, height: 20 },
        { text: 'Left off-slide', left: -50, top: 10, width: 20, height: 20 },
        { text: 'Right off-slide', left: 110, top: 10, width: 20, height: 20 },
        { text: 'Partially visible', left: -10, top: 20, width: 30, height: 40 },
        { text: 'Visible', left: 30, top: 30, width: 20, height: 20 },
      ],
    }],
  }).pages[0];
  assert.deepEqual(page.blocks.map((block) => block.text), ['Partially visible', 'Visible']);
  assert.deepEqual(page.blocks[0].geometry, { x: 0, y: 0.2, width: 0.2, height: 0.4 });
});

test('keeps page identity even when no visible blocks remain', () => {
  const sourceMap = normalizeSourceMap({
    filename: 'HiddenSlide.pptx', type: 'pptx', pages: [{
      number: 1, width: 100, height: 100, speakerNotes: 'Hidden slide note',
      blocks: [{ text: 'Off canvas author note', left: 200, top: 0, width: 20, height: 20 }],
    }],
  });
  assert.equal(sourceMap.pageCount, 1);
  assert.equal(sourceMap.pages[0].id, 'slide-0001');
  assert.deepEqual(sourceMap.pages[0].blocks, []);
  assert.equal(sourceMap.pages[0].speakerNotes, 'Hidden slide note');
});

test('uses null rather than invented geometry or style', () => {
  const sourceMap = normalizeSourceMap({
    filename: 'Scan.pdf', type: 'pdf',
    pages: [{ number: 1, width: null, height: null, blocks: [{ text: 'Native text' }] }],
  });
  assert.equal(sourceMap.pages[0].blocks[0].geometry, null);
  assert.equal(sourceMap.pages[0].blocks[0].style, null);
  assert.equal(sourceMap.pages[0].speakerNotes, null);
});

test('Markdown is generated from source-map identity and preserves empty markers', () => {
  const sourceMap = normalizeSourceMap({
    filename: 'Example.pptx', type: 'pptx', pages: [
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

test('chunk ranges and sliced maps preserve original numbering', () => {
  assert.deepEqual(planChunkRanges(50), []);
  assert.deepEqual(planChunkRanges(81), [{ start: 1, end: 40 }, { start: 41, end: 80 }, { start: 81, end: 81 }]);
  const sourceMap = normalizeSourceMap({
    filename: 'Large.pdf', type: 'pdf',
    pages: Array.from({ length: 81 }, (_, index) => ({
      number: index + 1, width: 100, height: 100,
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

test('chunk artifact plan creates aligned PDF Markdown and JSON pairs', () => {
  const outputDir = resolve('Example-prepared');
  const chunks = planChunkArtifacts(outputDir, 'Example', 81, 40);
  assert.equal(chunks.length, 3);
  assert.equal(basename(chunks[0].pdfPath), 'Example-0001-0040.pdf');
  assert.equal(basename(chunks[0].markdownPath), 'Example-0001-0040.md');
  assert.equal(basename(chunks[0].jsonPath), 'Example-0001-0040.json');
  assert.equal(basename(chunks[2].pdfPath), 'Example-0081-0081.pdf');
});

test('preparation planning keeps all outputs beside an unchanged source', () => {
  const plan = planPreparation(join('C:', 'slides', 'Teaching Deck.pptx'));
  assert.equal(plan.type, 'pptx');
  assert.equal(basename(plan.outputDir), 'Teaching Deck-prepared');
  assert.equal(basename(plan.copiedSourcePath), 'Teaching Deck.pptx');
  assert.equal(basename(plan.renderedPdfPath), 'Teaching Deck-rendered.pdf');
  assert.equal(basename(plan.indexPath), 'Teaching Deck-index.md');
  assert.equal(basename(plan.sourceMapPath), 'Teaching Deck-source-map.json');
  assert.throws(() => planPreparation('deck.txt'), /supports only \.pptx and \.pdf/);
});

test('output lifecycle refuses stale output unless forced', () => {
  const root = tempDir();
  try {
    const outputDir = join(root, 'Deck-prepared');
    mkdirSync(outputDir);
    writeFileSync(join(outputDir, 'stale.txt'), 'stale');
    assert.throws(() => prepareOutputDirectory(outputDir, false), /already exists/);
    prepareOutputDirectory(outputDir, true);
    assert.equal(existsSync(join(outputDir, 'stale.txt')), false);
    assert.equal(existsSync(outputDir), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failed prepared-output work removes partial output', () => {
  const root = tempDir();
  const outputDir = join(root, 'Deck-prepared');
  try {
    assert.throws(() => withPreparedOutput(outputDir, false, () => {
      writeFileSync(join(outputDir, 'partial.txt'), 'partial');
      throw new Error('synthetic extraction failure');
    }), /synthetic extraction failure/);
    assert.equal(existsSync(outputDir), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('failure reporting is explicit and stable', () => {
  assert.equal(formatFailure(new Error('PowerPoint unavailable')), 'Slide preparation failed: PowerPoint unavailable');
});

test('parses Poppler bbox XHTML into page-scoped text with geometry', () => {
  const xhtml = `<?xml version="1.0" encoding="UTF-8"?><doc>
    <page width="612" height="792"><flow><block><line xMin="10" yMin="20" xMax="200" yMax="40">
      <word>Hello</word><word>&amp;</word><word>world</word>
    </line></block></flow></page>
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
  assert.deepEqual(parseArgs(['deck.pptx']), { help: false, sourcePath: 'deck.pptx', force: false, chunkSize: 40 });
  assert.deepEqual(parseArgs(['deck.pdf', '--force', '--chunk-size', '25']), { help: false, sourcePath: 'deck.pdf', force: true, chunkSize: 25 });
  assert.throws(() => parseArgs(['a.pdf', 'b.pdf']), /exactly one source path/);
  assert.throws(() => parseArgs(['deck.pdf', '--chunk-size', '0']), /positive integer/);
});

test('Windows human launcher always keeps the result visible', () => {
  const launcher = readFileSync(new URL('../prepare-slides.cmd', import.meta.url), 'utf8');
  assert.match(launcher, /pause\s*\r?\nexit \/b %EXIT_CODE%/i);
  assert.doesNotMatch(launcher, /if not "%~1"=="" pause/i);
});

test('PowerPoint adapter filters invisible groups/shapes and off-slide geometry before extraction', () => {
  const script = readFileSync(new URL('../pptx-extract.ps1', import.meta.url), 'utf8');
  assert.match(script, /if \(-not \(Test-ShapeVisible \$Shape\)\) \{ return \}/);
  assert.match(script, /Test-ShapeIntersectsSlide/);
  assert.match(script, /Add-ShapeBlocks -Shape \$Shape\.GroupItems\.Item\(\$index\).*?-SlideWidth \$SlideWidth -SlideHeight \$SlideHeight/s);
  assert.match(script, /Hidden slides remain represented/);
});

test('direct CLI invocation executes preparation and reports a supported-source failure', () => {
  const root = tempDir();
  const sourcePath = join(root, 'Missing.pdf');
  const cliPath = fileURLToPath(new URL('../cli.mjs', import.meta.url));
  try {
    const result = spawnSync(process.execPath, [cliPath, sourcePath], {
      encoding: 'utf8',
      windowsHide: true,
    });
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
    assert.notEqual(result.status, 0, `direct CLI unexpectedly succeeded:\n${output}`);
    assert.match(output, /Slide preparation failed: Source file does not exist:/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
