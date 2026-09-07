#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeSourceMap,
  padPage,
  parsePopplerBboxXhtml,
  planChunkRanges,
  sliceSourceMap,
  sourceMapToMarkdown,
} from './core.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const DEFAULT_CHUNK_SIZE = 40;
const DEFAULT_CHUNK_THRESHOLD = 50;
const MAX_COMMAND_OUTPUT = 256 * 1024 * 1024;

function usage() {
  return `Usage: npm run slide-prep -- <source.pptx|source.pdf> [--force] [--chunk-size N]\n\n` +
    `  --force         Replace an existing <name>-prepared directory.\n` +
    `  --chunk-size N  Chunk size for sources over ${DEFAULT_CHUNK_THRESHOLD} pages/slides (default ${DEFAULT_CHUNK_SIZE}).\n`;
}

export function parseArgs(argv) {
  let sourcePath = null;
  let force = false;
  let chunkSize = DEFAULT_CHUNK_SIZE;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--force') {
      force = true;
      continue;
    }
    if (arg === '--chunk-size') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value <= 0) throw new Error('--chunk-size must be a positive integer.');
      chunkSize = value;
      continue;
    }
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    if (sourcePath) throw new Error('Provide exactly one source path.');
    sourcePath = arg;
  }

  if (!sourcePath) throw new Error('A .pptx or .pdf source path is required.');
  return { help: false, sourcePath, force, chunkSize };
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? process.cwd(),
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
    maxBuffer: MAX_COMMAND_OUTPUT,
  });
  if (result.error) throw new Error(`${command} failed to start: ${result.error.message}`);
  if (result.status !== 0) {
    const detail = String(result.stderr || result.stdout || '').trim();
    throw new Error(`${command} failed with exit code ${result.status}${detail ? `: ${detail}` : ''}`);
  }
  return result;
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where.exe' : 'which';
  const result = spawnSync(checker, [command], {
    encoding: 'utf8',
    shell: false,
    windowsHide: true,
  });
  return !result.error && result.status === 0;
}

function requireCommand(command, purpose) {
  if (!commandExists(command)) {
    throw new Error(`${command} is required for ${purpose}. Install Poppler command-line tools and ensure ${command} is on PATH.`);
  }
}

function safeStem(filename) {
  return basename(filename, extname(filename));
}

function prepareOutputDirectory(sourcePath, force) {
  const stem = safeStem(sourcePath);
  const outputDir = join(dirname(sourcePath), `${stem}-prepared`);
  if (existsSync(outputDir)) {
    if (!force) throw new Error(`Output directory already exists: ${outputDir}. Re-run with --force to replace it.`);
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: false });
  return outputDir;
}

function writeSourceArtifacts(sourceMap, outputDir, stem) {
  const sourceMapPath = join(outputDir, `${stem}-source-map.json`);
  const indexPath = join(outputDir, `${stem}-index.md`);
  writeFileSync(sourceMapPath, `${JSON.stringify(sourceMap, null, 2)}\n`, 'utf8');
  writeFileSync(indexPath, sourceMapToMarkdown(sourceMap), 'utf8');
  return { sourceMapPath, indexPath };
}

function preparePptx(sourcePath, outputDir, stem) {
  if (process.platform !== 'win32') {
    throw new Error('PPTX preparation v1 is Windows-first and requires desktop Microsoft PowerPoint.');
  }

  const renderedPdfPath = join(outputDir, `${stem}-rendered.pdf`);
  const rawJsonPath = join(outputDir, '.pptx-extraction.json');
  const scriptPath = join(TOOL_DIR, 'pptx-extract.ps1');
  const powershell = commandExists('powershell.exe') ? 'powershell.exe' : 'pwsh.exe';
  if (!commandExists(powershell)) throw new Error('PowerShell is required for PowerPoint automation.');

  try {
    run(powershell, [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', scriptPath,
      '-InputPath', sourcePath,
      '-RenderedPdfPath', renderedPdfPath,
      '-JsonPath', rawJsonPath,
    ]);
    const raw = JSON.parse(readFileSync(rawJsonPath, 'utf8').replace(/^\uFEFF/, ''));
    const sourceMap = normalizeSourceMap({
      filename: basename(sourcePath),
      type: 'pptx',
      pages: raw.pages,
    });
    return { sourceMap, renderedPdfPath };
  } finally {
    rmSync(rawJsonPath, { force: true });
  }
}

function preparePdf(sourcePath) {
  requireCommand('pdftotext', 'native PDF text and bounding-box extraction');
  const result = run('pdftotext', ['-q', '-bbox-layout', '-enc', 'UTF-8', sourcePath, '-']);
  const pages = parsePopplerBboxXhtml(result.stdout);
  const sourceMap = normalizeSourceMap({
    filename: basename(sourcePath),
    type: 'pdf',
    pages,
  });
  return { sourceMap, renderedPdfPath: sourcePath };
}

function splitPdfRange(sourcePdfPath, outputPdfPath, start, end) {
  requireCommand('pdfseparate', 'large-deck PDF chunking');
  requireCommand('pdfunite', 'large-deck PDF chunking');

  const tempDir = mkdtempSync(join(tmpdir(), 'flash-cards-slide-prep-'));
  try {
    const pattern = join(tempDir, 'page-%d.pdf');
    run('pdfseparate', ['-f', String(start), '-l', String(end), sourcePdfPath, pattern]);
    const pageFiles = readdirSync(tempDir)
      .map((name) => {
        const match = /^page-(\d+)\.pdf$/i.exec(name);
        return match ? { name, page: Number(match[1]) } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.page - b.page)
      .map(({ name }) => join(tempDir, name));

    const expectedCount = end - start + 1;
    if (pageFiles.length !== expectedCount) {
      throw new Error(`PDF chunk ${start}-${end} produced ${pageFiles.length} pages; expected ${expectedCount}.`);
    }
    run('pdfunite', [...pageFiles, outputPdfPath]);
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

function createChunks(sourceMap, sourcePdfPath, outputDir, stem, chunkSize) {
  const ranges = planChunkRanges(sourceMap.pageCount, {
    threshold: DEFAULT_CHUNK_THRESHOLD,
    chunkSize,
  });
  if (ranges.length === 0) return [];

  const chunksDir = join(outputDir, 'chunks');
  mkdirSync(chunksDir, { recursive: false });
  const outputs = [];

  for (const range of ranges) {
    const rangeName = `${stem}-${padPage(range.start)}-${padPage(range.end)}`;
    const chunkMap = sliceSourceMap(sourceMap, range.start, range.end);
    const jsonPath = join(chunksDir, `${rangeName}.json`);
    const markdownPath = join(chunksDir, `${rangeName}.md`);
    const pdfPath = join(chunksDir, `${rangeName}.pdf`);

    writeFileSync(jsonPath, `${JSON.stringify(chunkMap, null, 2)}\n`, 'utf8');
    writeFileSync(markdownPath, sourceMapToMarkdown(chunkMap), 'utf8');
    splitPdfRange(sourcePdfPath, pdfPath, range.start, range.end);
    outputs.push({ ...range, jsonPath, markdownPath, pdfPath });
  }

  return outputs;
}

export function prepareSource(options) {
  const sourcePath = resolve(options.sourcePath);
  if (!existsSync(sourcePath)) throw new Error(`Source file does not exist: ${sourcePath}`);
  const extension = extname(sourcePath).toLowerCase();
  if (extension !== '.pptx' && extension !== '.pdf') {
    throw new Error(`Unsupported source type ${extension || '[none]'}. V1 supports only .pptx and .pdf.`);
  }

  const outputDir = prepareOutputDirectory(sourcePath, options.force);
  const stem = safeStem(sourcePath);
  let succeeded = false;
  try {
    const copiedSourcePath = join(outputDir, basename(sourcePath));
    copyFileSync(sourcePath, copiedSourcePath);

    const prepared = extension === '.pptx'
      ? preparePptx(sourcePath, outputDir, stem)
      : preparePdf(sourcePath);
    const { sourceMap } = prepared;
    const artifacts = writeSourceArtifacts(sourceMap, outputDir, stem);
    const chunkPdfSource = extension === '.pptx' ? prepared.renderedPdfPath : copiedSourcePath;
    const chunks = createChunks(sourceMap, chunkPdfSource, outputDir, stem, options.chunkSize);

    succeeded = true;
    return {
      sourcePath,
      outputDir,
      type: extension.slice(1),
      pageCount: sourceMap.pageCount,
      renderedPdfPath: extension === '.pptx' ? prepared.renderedPdfPath : null,
      ...artifacts,
      chunks,
      warnings: [],
    };
  } finally {
    if (!succeeded) rmSync(outputDir, { recursive: true, force: true });
  }
}

function printSummary(result) {
  console.log(`Source: ${result.sourcePath}`);
  console.log(`Type: ${result.type}`);
  console.log(`Slides/pages: ${result.pageCount}`);
  console.log(`Rendered PDF: ${result.renderedPdfPath ?? 'not applicable'}`);
  console.log(`Index: ${result.indexPath}`);
  console.log(`Source map: ${result.sourceMapPath}`);
  console.log(`Chunks: ${result.chunks.length}`);
  console.log(`Warnings: ${result.warnings.length}`);
  console.log(`Output directory: ${result.outputDir}`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  try {
    const options = parseArgs(process.argv.slice(2));
    if (options.help) {
      process.stdout.write(usage());
    } else {
      printSummary(prepareSource(options));
    }
  } catch (error) {
    console.error(`Slide preparation failed: ${error instanceof Error ? error.message : String(error)}`);
    console.error('');
    console.error(usage().trimEnd());
    process.exitCode = 1;
  }
}
