import { spawnSync } from 'node:child_process';

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

/**
 * Resolve the complete feature diff from the merge-base of the actual PR base/head.
 * This avoids last-commit approximations and avoids treating unrelated base-branch
 * advancement as feature work when the branch is behind main.
 * @param {string} root
 * @param {string} baseRef
 * @param {string} headRef
 */
export function changedFilesFromFeatureDiff(root, baseRef, headRef) {
  if (!baseRef || !headRef) throw new Error('Feature diff base/head must be non-empty.');
  const output = gitOutput(
    root,
    ['diff', '--name-only', '--no-renames', '--diff-filter=ACDMRTUXB', `${baseRef}...${headRef}`],
    `Unable to read feature diff ${baseRef}...${headRef}`,
  );
  return [...new Set(gitPathList(output))].sort();
}

/**
 * Resolve the intended feature-branch base without network access or Git mutation.
 * Prefer the remote-tracking main ref because `git fetch origin` may advance it
 * while leaving a developer's local `main` branch stale.
 * @param {string} root
 * @param {string | null} [override]
 */
export function resolveDiffBase(root, override = null) {
  const candidates = override ? [override] : ['origin/main', 'main'];
  let baseRef = null;
  for (const candidate of candidates) {
    const result = git(root, ['rev-parse', '--verify', '--quiet', `${candidate}^{commit}`]);
    if (result.status === 0) {
      baseRef = candidate;
      break;
    }
  }
  if (!baseRef) {
    const requested = override ? `Git ref "${override}"` : 'origin/main or local main';
    throw new Error(`Unable to resolve ${requested}. Fetch/update the intended base locally or rerun with --base <ref>. No Git state was changed.`);
  }
  const mergeBase = gitOutput(root, ['merge-base', 'HEAD', baseRef], `Unable to compute merge-base with ${baseRef}`);
  if (!mergeBase) throw new Error(`Git returned an empty merge-base for ${baseRef}.`);
  return { baseRef, mergeBase };
}

/**
 * Build the local whitespace-check invocation. Comparing the merge-base directly
 * with the working tree covers committed branch changes plus staged and unstaged
 * tracked changes in one read-only diff.
 * @param {string} root
 * @param {string | null} [override]
 */
export function localDiffCheck(root, override = null) {
  const { baseRef, mergeBase } = resolveDiffBase(root, override);
  return {
    baseRef,
    mergeBase,
    args: ['diff', '--check', mergeBase],
  };
}
