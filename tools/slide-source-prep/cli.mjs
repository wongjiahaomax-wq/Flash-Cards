#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync,
  readdirSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizeSourceMap, padPage, parsePopplerBboxXhtml, planChunkRanges,
  sliceSourceMap, sourceMapToMarkdown,
} from './core.mjs';

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_CHUNK_SIZE = 40;
export const DEFAULT_CHUNK_THRESHOLD = 50;
const MAX_COMMAND_OUTPUT = 256 * 1024 * 1024;

export function usage() {
  return `Usage: npm run slide-prep -- <source.pptx|source.pdf> [--force] [--chunk-size N]\n\n` +
    `  --force         Replace an existing <name>-prepared directory.\n` +
    `  --chunk-size N  Chunk size for sources over ${DEFAULT_CHUNK_THRESHOLD} pages/slides (default ${DEFAULT_CHUNK_SIZE}).\n`;
}

export function formatFailure(error) {
  return `Slide preparation failed: ${error instanceof Error ? error.message : String(error)}`;
}

export function parseArgs(argv) {
  let sourcePath = null;
  let force = false;
  let chunkSize = DEFAULT_CHUNK_SIZE;
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--force') { force = true; continue; }
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
    cwd: options.cwd ?? process.cwd(), encoding: 'utf8', shell: false,
    windowsHide: true, maxBuffer: MAX_COMMAND_OUTPUT,
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
  const result = spawnSync(checker, [command], { encoding: 'utf8', shell: false, windowsHide: true });
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

export function planPreparation(sourceInput) {
  const sourcePath = resolve(sourceInput);
  const extension = extname(sourcePath).toLowerCase();
  if (extension !== '.pptx' && extension !== '.pdf') {
    throw new Error(`Unsupported source type ${extension || '[none]'}. V1 supports only .pptx and .pdf.`);
  }
  const stem = safeStem(sourcePath);
  const outputDir = join(dirname(sourcePath), `${stem}-prepared`);
  return {
    sourcePath, extension, type: extension.slice(1), stem, outputDir,
    copiedSourcePath: join(outputDir, basename(sourcePath)),
    renderedPdfPath: extension === '.pptx' ? join(outputDir, `${stem}-rendered.pdf`) : null,
    indexPath: join(outputDir, `${stem}-index.md`),
    sourceMapPath: join(outputDir, `${stem}-source-map.json`),
  };
}

export function prepareOutputDirectory(outputDir, force) {
  if (existsSync(outputDir)) {
    if (!force) throw new Error(`Output directory already exists: ${outputDir}. Re-run with --force to replace it.`);
    rmSync(outputDir, { recursive: true, force: true });
  }
  mkdirSync(outputDir, { recursive: false });
  return outputDir;
}

export function withPreparedOutput(outputDir, force, work) {
  prepareOutputDirectory(outputDir, force);
  let succeeded = false;
  try {
    const result = work();
    succeeded = true;
    return result;
  } finally {
    if (!succeeded) rmSync(outputDir, { recursive: true, force: true });
  }
}

export function planChunkArtifacts(outputDir, stem, pageCount, chunkSize = DEFAULT_CHUNK_SIZE) {
  const ranges = planChunkRanges(pageCount, { threshold: DEFAULT_CHUNK_THRESHOLD, chunkSize });
  const chunksDir = join(outputDir, 'chunks');
  return ranges.map((range) => {
    const rangeName = `${stem}-${padPage(range.start)}-${padPage(range.end)}`;
    return {
      ...range, rangeName, chunksDir,
      jsonPath: join(chunksDir, `${rangeName}.json`),
      markdownPath: join(chunksDir, `${rangeName}.md`),
      pdfPath: join(chunksDir, `${rangeName}.pdf`),
    };
  });
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
  return { sourceMap };
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
  const chunks = planChunkArtifacts(outputDir, stem, sourceMap.pageCount, chunkSize);
  if (chunks.length === 0) return [];

  mkdirSync(chunks[0].chunksDir, { recursive: false });
  for (const chunk of chunks) {
    const chunkMap = sliceSourceMap(sourceMap, chunk.start, chunk.end);
    writeFileSync(chunk.jsonPath, `${JSON.stringify(chunkMap, null, 2)}\n`, 'utf8');
    writeFileSync(chunk.markdownPath, sourceMapToMarkdown(chunkMap), 'utf8');
    splitPdfRange(sourcePdfPath, chunk.pdfPath, chunk.start, chunk.end);
  }
  return chunks;
}

export function prepareSource(options) {
  const plan = planPreparation(options.sourcePath);
  if (!existsSync(plan.sourcePath)) throw new Error(`Source file does not exist: ${plan.sourcePath}`);

  return withPreparedOutput(plan.outputDir, options.force, () => {
    copyFileSync(plan.sourcePath, plan.copiedSourcePath);

    const prepared = plan.type === 'pptx'
      ? preparePptx(plan.sourcePath, plan.outputDir, plan.stem)
      : preparePdf(plan.sourcePath);
    const { sourceMap } = prepared;
    const artifacts = writeSourceArtifacts(sourceMap, plan.outputDir, plan.stem);
    const chunkPdfSource = plan.type === 'pptx' ? prepared.renderedPdfPath : plan.copiedSourcePath;
    const chunks = createChunks(sourceMap, chunkPdfSource, plan.outputDir, plan.stem, options.chunkSize);

    return {
      sourcePath: plan.sourcePath,
      outputDir: plan.outputDir,
      type: plan.type,
      pageCount: sourceMap.pageCount,
      renderedPdfPath: plan.renderedPdfPath,
      ...artifacts,
      chunks,
      warnings: [],
    };
  });
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
    console.error(formatFailure(error));
    console.error('');
    console.error(usage().trimEnd());
    process.exitCode = 1;
  }
}
