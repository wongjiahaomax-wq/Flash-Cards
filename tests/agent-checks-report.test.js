import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyChangedFiles } from '../scripts/agent-checks-lib.mjs';
import {
  changedFilesFromGit,
  checkUntrackedWhitespace,
  contextualizeAgentChecksReport,
  printAgentChecksReport,
  untrackedFilesFromGit,
} from '../scripts/agent-checks.mjs';
import { resolveDiffBase } from '../scripts/validation-git.mjs';

/** @param {string} cwd @param {string[]} args @param {{ allowFailure?: boolean }} [options] */
function runGit(cwd, args, options = {}) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (!options.allowFailure) {
    assert.equal(result.status, 0, `git ${args.join(' ')} failed: ${result.stderr || result.error?.message || ''}`);
  }
  return result;
}

/** @param {string} root */
function initializeRepository(root) {
  runGit(root, ['init', '-b', 'main']);
  runGit(root, ['config', 'user.name', 'Agent Checks Test']);
  runGit(root, ['config', 'user.email', 'agent-checks@example.invalid']);
  fs.writeFileSync(path.join(root, 'base.txt'), 'base\n');
  runGit(root, ['add', 'base.txt']);
  runGit(root, ['commit', '-m', 'base']);
  const base = String(runGit(root, ['rev-parse', 'HEAD']).stdout ?? '').trim();
  runGit(root, ['update-ref', 'refs/remotes/origin/main', base]);
  return base;
}

test('real Git-backed agent:checks report uses merge-base for committed docs-only whitespace validation', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-agent-checks-report-'));
  try {
    const base = initializeRepository(root);

    runGit(root, ['switch', '-c', 'agent/docs-whitespace']);
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', 'foo.md'), 'committed trailing whitespace  \n');
    runGit(root, ['add', 'docs/foo.md']);
    runGit(root, ['commit', '-m', 'docs whitespace fixture']);

    const { baseRef, mergeBase } = resolveDiffBase(root);
    assert.equal(baseRef, 'origin/main');
    assert.equal(mergeBase, base);

    const files = changedFilesFromGit(root, mergeBase);
    assert.deepEqual(files, ['docs/foo.md']);

    const report = contextualizeAgentChecksReport(classifyChangedFiles(files), mergeBase);
    assert.deepEqual(report.requiredChecks, ['diff']);
    assert.deepEqual(report.requiredCommands, [`git diff --check ${mergeBase}`]);

    /** @type {string[]} */
    const output = [];
    const originalLog = console.log;
    console.log = (...values) => output.push(values.join(' '));
    try {
      printAgentChecksReport(report, `${baseRef} (merge-base ${mergeBase.slice(0, 12)})`);
    } finally {
      console.log = originalLog;
    }

    assert.equal(output.join('\n').includes(`- git diff --check ${mergeBase}`), true);
    assert.notEqual(runGit(root, ['diff', '--check', mergeBase], { allowFailure: true }).status, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('untracked docs whitespace is checked directly instead of being implied covered by merge-base diff', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-agent-checks-untracked-'));
  try {
    const base = initializeRepository(root);
    runGit(root, ['switch', '-c', 'agent/untracked-docs']);
    fs.mkdirSync(path.join(root, 'docs'));
    fs.writeFileSync(path.join(root, 'docs', 'new-guide.md'), 'untracked trailing whitespace  \n');

    const { mergeBase } = resolveDiffBase(root);
    assert.equal(mergeBase, base);

    const untrackedFiles = untrackedFilesFromGit(root);
    assert.deepEqual(untrackedFiles, ['docs/new-guide.md']);
    assert.deepEqual(changedFilesFromGit(root, mergeBase, untrackedFiles), ['docs/new-guide.md']);

    const untrackedWhitespace = checkUntrackedWhitespace(root, untrackedFiles);
    assert.deepEqual(untrackedWhitespace.checkedFiles, ['docs/new-guide.md']);
    assert.equal(untrackedWhitespace.diagnostics.length > 0, true);
    assert.match(untrackedWhitespace.diagnostics.join('\n'), /trailing whitespace/i);

    const report = contextualizeAgentChecksReport(classifyChangedFiles(untrackedFiles), mergeBase);
    assert.deepEqual(report.requiredChecks, ['diff']);
    assert.deepEqual(report.requiredCommands, [`git diff --check ${mergeBase}`]);

    /** @type {string[]} */
    const output = [];
    const originalLog = console.log;
    console.log = (...values) => output.push(values.join(' '));
    try {
      printAgentChecksReport(report, `origin/main (merge-base ${mergeBase.slice(0, 12)})`, untrackedWhitespace);
    } finally {
      console.log = originalLog;
    }

    const printed = output.join('\n');
    assert.match(printed, /FAIL: checked 1 untracked file\(s\) directly with Git whitespace rules/);
    assert.match(printed, /required merge-base git diff command covers tracked changes; this direct check covers untracked files/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
