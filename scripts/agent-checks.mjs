import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findRepositoryRoot } from './agent-doctor-lib.mjs';
import { classifyChangedFiles } from './agent-checks-lib.mjs';
import { resolveDiffBase } from './validation-git.mjs';

/** @param {string[]} argv */
export function parseAgentChecksArgs(argv) {
  let base = null;
  let files = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') {
      base = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--files') {
      const value = argv[index + 1] ?? '';
      files = value.split(',').map((file) => file.trim()).filter(Boolean);
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (base === '') throw new Error('--base requires a Git ref.');
  if (files && files.length === 0) throw new Error('--files requires a comma-separated path list.');
  return { base, files };
}

/** @param {string} root @param {string[]} args */
function git(root, args) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

/** @param {string} root @param {string[]} args @param {string} description */
function gitOutput(root, args, description) {
  const result = git(root, args);
  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.error?.message || `git exited with ${result.status}`;
    throw new Error(`${description}: ${detail}`);
  }
  return result.stdout.trim();
}

/**
 * Include committed feature-branch changes, tracked working-tree changes, and untracked files.
 * @param {string} root
 * @param {string} mergeBase
 */
export function changedFilesFromGit(root, mergeBase) {
  const committed = gitOutput(
    root,
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB', `${mergeBase}..HEAD`],
    'Unable to read committed branch diff',
  );
  const working = gitOutput(
    root,
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'HEAD'],
    'Unable to read working-tree diff',
  );
  const untracked = gitOutput(
    root,
    ['ls-files', '--others', '--exclude-standard'],
    'Unable to read untracked files',
  );
  return [...new Set(
    [committed, working, untracked]
      .flatMap((value) => value.split(/\r?\n/))
      .map((value) => value.trim())
      .filter(Boolean),
  )].sort();
}

/** @param {string} title @param {string[]} values @param {string} [emptyText] */
function printSection(title, values, emptyText = '(none)') {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
  if (!values.length) {
    console.log(emptyText);
    return;
  }
  for (const value of values) console.log(`- ${value}`);
}

/** @param {{ files: string[], areas: string[], requiredCommands: string[], recommendations: string[], notRequiredCommands: string[], unclassifiedImportant: string[] }} report @param {string} baseDescription */
export function printAgentChecksReport(report, baseDescription) {
  console.log(`Diff base: ${baseDescription}`);
  printSection('Changed files', report.files, '(no changed files detected)');
  printSection('Affected areas', report.areas, '(none)');
  printSection('Required automated checks', report.requiredCommands, '(none)');
  printSection('Recommended follow-up', report.recommendations, '(none)');
  printSection('Not required', report.notRequiredCommands, '(none)');
  if (report.unclassifiedImportant.length) {
    console.warn(`\nWARNING: fail-safe full validation applied to ${report.unclassifiedImportant.length} unclassified code/tooling path(s).`);
  }
}

/** @param {string[]} [argv] */
export function runAgentChecks(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseAgentChecksArgs(argv);
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
    return 2;
  }

  const root = findRepositoryRoot();
  if (!root) {
    console.error('ERROR: repository root could not be detected. Run this command from inside the Flash-Cards checkout.');
    return 1;
  }

  try {
    if (args.files) {
      const report = classifyChangedFiles(args.files);
      printAgentChecksReport(report, 'explicit --files list (Git diff not inspected)');
      return 0;
    }
    const { baseRef, mergeBase } = resolveDiffBase(root, args.base);
    const files = changedFilesFromGit(root, mergeBase);
    const report = classifyChangedFiles(files);
    printAgentChecksReport(report, `${baseRef} (merge-base ${mergeBase.slice(0, 12)})`);
    return 0;
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exitCode = runAgentChecks();
