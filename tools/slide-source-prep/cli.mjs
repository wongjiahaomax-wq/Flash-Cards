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
    if (sourcePath) throw new Error(Provide exactly one source path.);
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
