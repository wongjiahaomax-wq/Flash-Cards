import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { findRepositoryRoot } from './agent-doctor-lib.mjs';
import { classifyChangedFiles } from './agent-checks-lib.mjs';
import { validationCommand } from './validation-contract.mjs';
import { resolveDiffBase } from './validation-git.mjs';

/** @param {string[]} argv */
export function parseAgentChecksArgs(argv) {
  let base = null;
  let files = null;
  let compact = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--base') {
      base = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--files') {
      const value = argv[index + 1] ?? '';
      files = value.split(',').map((file) => file.trim()).filter(Boolean);
      index += 1;
    } else if (arg === '--compact') {
      compact = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (base === '') throw new Error('--base requires a Git ref.');
  if (files && files.length === 0) throw new Error('--files requires a comma-separated path list.');
  return { base, files, compact };
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

/** @param {string} value */
function gitPathList(value) {
  return value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

/** @param {string} root */
export function untrackedFilesFromGit(root) {
  return gitPathList(gitOutput(
    root,
    ['ls-files', '--others', '--exclude-standard'],
    'Unable to read untracked files',
  ));
}

/**
 * Include committed feature-branch changes, tracked working-tree changes, and untracked files.
 * @param {string} root
 * @param {string} mergeBase
 * @param {string[] | null} [knownUntracked]
 */
export function changedFilesFromGit(root, mergeBase, knownUntracked = null) {
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
  const untracked = knownUntracked ?? untrackedFilesFromGit(root);
  return [...new Set([
    ...gitPathList(committed),
    ...gitPathList(working),
    ...untracked,
  ])].sort();
}

/**
 * Git diff whitespace validation does not include completely untracked files. Check those files
 * separately with Git's own whitespace engine against a temporary empty file. A normal no-index
 * difference exits 1; whitespace/fatal errors exit above 1 and are reported.
 * @param {string} root
 * @param {string[]} files
 */
export function checkUntrackedWhitespace(root, files) {
  if (!files.length) return { checkedFiles: [], diagnostics: [] };

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-agent-whitespace-'));
  const emptyFile = path.join(tempRoot, 'empty');
  fs.writeFileSync(emptyFile, '');

  /** @type {string[]} */
  const diagnostics = [];
  try {
    for (const file of files) {
      const result = git(root, ['diff', '--no-index', '--check', '--', emptyFile, path.resolve(root, file)]);
      if (result.status === 0 || result.status === 1) continue;
      const detail = [result.stdout, result.stderr]
        .map((value) => value?.trim())
        .filter(Boolean)
        .join('\n');
      diagnostics.push(detail || `${file}: git diff --no-index --check exited with ${result.status}`);
    }
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }

  return { checkedFiles: [...files], diagnostics };
}

/**
 * Apply invocation-specific Git context to the classifier's generic check IDs.
 * Real Git-backed runs get the same merge-base whitespace command as local validation;
 * fixture mode intentionally keeps the generic command representation.
 * @param {{ files: string[], areas: string[], iterationGuidance: string[], checkpointGuidance: string[], requiredChecks: string[], requiredCommands: string[], specializedRequiredChecks: string[], specializedRequiredCommands: string[], recommendations: string[], notRequiredChecks: string[], notRequiredCommands: string[], unclassifiedImportant: string[] }} report
 * @param {string | null} [mergeBase]
 */
export function contextualizeAgentChecksReport(report, mergeBase = null) {
  /** @param {string} checkId */
  const formatCommand = (checkId) => {
    const { command, args } = validationCommand(
      checkId,
      mergeBase ? { diffArgs: ['diff', '--check', mergeBase] } : {},
    );
    return `${command} ${args.join(' ')}`;
  };

  return {
    ...report,
    requiredCommands: report.requiredChecks.map(formatCommand),
    notRequiredCommands: report.notRequiredChecks.map(formatCommand),
  };
}

/**
 * Convert internal raw `node --test <file>` ownership to the repository-owned
 * compact local test entry point when instructions are presented to agents.
 * CI keeps the raw command identity and injects its structured reporter itself.
 * @param {string} command
 */
export function localPresentationCommand(command) {
  const match = /^node --test (.+)$/.exec(command);
  return match ? `npm test -- ${match[1]}` : command;
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

/**
 * @param {{ files: string[], areas: string[], iterationGuidance: string[], checkpointGuidance: string[], requiredCommands: string[], recommendations: string[], notRequiredCommands: string[], unclassifiedImportant: string[] }} report
 * @param {string} baseDescription
 * @param {{ checkedFiles: string[], diagnostics: string[] } | null} [untrackedWhitespace]
 */
export function printAgentChecksReport(report, baseDescription, untrackedWhitespace = null) {
  const requiredCommands = report.requiredCommands.map(localPresentationCommand);
  const notRequiredCommands = report.notRequiredCommands.map(localPresentationCommand);
  console.log(`Diff base: ${baseDescription}`);
  printSection('Changed files', report.files, '(no changed files detected)');
  printSection('Affected areas', report.areas, '(none)');
  printSection('Iteration guidance', report.iterationGuidance, '(none)');
  printSection('Checkpoint guidance', report.checkpointGuidance, '(none)');
  console.log('\nHandoff: run every command under Required automated checks before final handoff/review.');
  printSection('Required automated checks', requiredCommands, '(none)');
  if (untrackedWhitespace?.checkedFiles.length) {
    console.log('\nUntracked whitespace validation');
    console.log('-------------------------------');
    console.log(`- ${untrackedWhitespace.diagnostics.length ? 'FAIL' : 'PASS'}: checked ${untrackedWhitespace.checkedFiles.length} untracked file(s) directly with Git whitespace rules.`);
    console.log('- The required merge-base git diff command covers tracked changes; this direct check covers untracked files.');
    for (const diagnostic of untrackedWhitespace.diagnostics) console.log(`- ${diagnostic}`);
  }
  printSection('Recommended follow-up', report.recommendations, '(none)');
  printSection('Not required', notRequiredCommands, '(none)');
  if (report.unclassifiedImportant.length) {
    console.warn(`\nWARNING: fail-safe full validation applied to ${report.unclassifiedImportant.length} unclassified code/tooling path(s).`);
  }
}

/**
 * Compact presentation of the same classification/report used by verbose mode.
 * Specialized commands are shown in their own section and omitted from ordinary
 * required/guidance sections when their exact command is already represented.
 * @param {{ files: string[], areas: string[], iterationGuidance: string[], checkpointGuidance: string[], requiredCommands: string[], specializedRequiredCommands: string[], recommendations: string[], unclassifiedImportant: string[] }} report
 * @param {string} baseDescription
 * @param {{ checkedFiles: string[], diagnostics: string[] } | null} [untrackedWhitespace]
 */
export function printCompactAgentChecksReport(report, baseDescription, untrackedWhitespace = null) {
  const requiredCommands = report.requiredCommands.map(localPresentationCommand);
  const specializedCommands = report.specializedRequiredCommands.map(localPresentationCommand);
  const specialized = new Set(specializedCommands);
  const ordinaryRequired = requiredCommands.filter((command) => !specialized.has(command));
  /** @param {string} value */
  const duplicatesSpecializedCommand = (value) => specializedCommands.some((command) => value.includes(command));
  const compactIterationGuidance = report.iterationGuidance.filter((value) => !duplicatesSpecializedCommand(value));
  const compactCheckpointGuidance = report.checkpointGuidance.filter((value) => !duplicatesSpecializedCommand(value));
  const handoffSections = specializedCommands.length
    ? 'Required automated checks and Specialized required checks'
    : 'Required automated checks';

  console.log(`Diff base: ${baseDescription}`);
  console.log(`Changed files: ${report.files.length}`);
  printSection('Affected areas', report.areas, '(none)');
  printSection('Iteration guidance', compactIterationGuidance, '(none)');
  printSection('Checkpoint guidance', compactCheckpointGuidance, '(none)');
  console.log(`\nHandoff: run every command under ${handoffSections} before final handoff/review.`);
  printSection('Required automated checks', ordinaryRequired, '(none)');
  if (specializedCommands.length) {
    printSection('Specialized required checks', specializedCommands);
  }
  if (untrackedWhitespace?.checkedFiles.length) {
    console.log('\nUntracked whitespace validation');
    console.log('-------------------------------');
    console.log(`- ${untrackedWhitespace.diagnostics.length ? 'FAIL' : 'PASS'}: checked ${untrackedWhitespace.checkedFiles.length} untracked file(s) directly with Git whitespace rules.`);
    for (const diagnostic of untrackedWhitespace.diagnostics) console.log(`- ${diagnostic}`);
  }
  printSection('Recommended follow-up', report.recommendations, '(none)');
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
      const printReport = args.compact ? printCompactAgentChecksReport : printAgentChecksReport;
      printReport(report, 'explicit --files list (Git diff not inspected)');
      return 0;
    }
    const { baseRef, mergeBase } = resolveDiffBase(root, args.base);
    const untrackedFiles = untrackedFilesFromGit(root);
    const files = changedFilesFromGit(root, mergeBase, untrackedFiles);
    const untrackedWhitespace = checkUntrackedWhitespace(root, untrackedFiles);
    const report = contextualizeAgentChecksReport(classifyChangedFiles(files), mergeBase);
    const printReport = args.compact ? printCompactAgentChecksReport : printAgentChecksReport;
    printReport(report, `${baseRef} (merge-base ${mergeBase.slice(0, 12)})`, untrackedWhitespace);
    return untrackedWhitespace.diagnostics.length ? 1 : 0;
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : error}`);
    return 1;
  }
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) process.exitCode = runAgentChecks();
