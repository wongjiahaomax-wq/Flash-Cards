import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MAINTAINED_TEST_FILE = /(?:^|\/)(?:test|test-[^/]+|[^/]+(?:\.test|-test|_test))\.(?:cjs|mjs|js)$/;
const IGNORED_DIRECTORIES = new Set([
  '.git',
  '.svelte-kit',
  '.wrangler',
  'build',
  'coverage',
  'dist',
  'node_modules',
]);

/**
 * Explicit fast-suite exclusions. Checkpoint 2A intentionally keeps this empty.
 * Future entries must be exact repository-relative maintained test paths.
 * @type {readonly string[]}
 */
export const FAST_TEST_EXCLUSIONS = Object.freeze([]);

/** @param {string} value */
function normalizeRepositoryPath(value) {
  return String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

/** @param {string} file */
export function isMaintainedNodeTestPath(file) {
  const normalized = normalizeRepositoryPath(file);
  if (!normalized || normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return false;
  const segments = normalized.split('/');
  if (segments.some((segment) => IGNORED_DIRECTORIES.has(segment))) return false;
  return MAINTAINED_TEST_FILE.test(normalized);
}

/** @param {string} root @param {string} relative @param {string[]} files */
async function walk(root, relative, files) {
  const directory = relative ? path.join(root, relative) : root;
  const entries = await readdir(directory, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    const child = relative ? path.posix.join(relative, entry.name) : entry.name;
    if (entry.isDirectory()) {
      if (!IGNORED_DIRECTORIES.has(entry.name)) await walk(root, child, files);
      continue;
    }
    if (entry.isFile() && isMaintainedNodeTestPath(child)) files.push(child);
  }
}

/** @param {string} [root] */
export async function discoverMaintainedNodeTests(root = REPOSITORY_ROOT) {
  /** @type {string[]} */
  const files = [];
  await walk(path.resolve(root), '', files);
  return [...new Set(files.map(normalizeRepositoryPath))].sort();
}

/**
 * @param {readonly string[]} discoveredTests
 * @param {readonly string[]} [exclusions]
 */
export function selectFastNodeTests(discoveredTests, exclusions = FAST_TEST_EXCLUSIONS) {
  const complete = [...new Set(discoveredTests.map(normalizeRepositoryPath).filter(Boolean))].sort();
  const normalizedExclusions = exclusions.map(normalizeRepositoryPath).filter(Boolean);
  if (new Set(normalizedExclusions).size !== normalizedExclusions.length) {
    throw new Error('Fast Node test exclusions must not contain duplicate paths.');
  }

  const completeSet = new Set(complete);
  for (const exclusion of normalizedExclusions) {
    if (!completeSet.has(exclusion)) {
      throw new Error(`Fast Node test exclusion does not exist in maintained discovery: ${exclusion}`);
    }
  }

  const exclusionSet = new Set(normalizedExclusions);
  const selected = complete.filter((file) => !exclusionSet.has(file));
  const excluded = complete.filter((file) => exclusionSet.has(file));
  return { complete, selected, excluded };
}

/** @param {string} [root] @param {readonly string[]} [exclusions] */
export async function resolveFastNodeTestSelection(root = REPOSITORY_ROOT, exclusions = FAST_TEST_EXCLUSIONS) {
  return selectFastNodeTests(await discoverMaintainedNodeTests(root), exclusions);
}
