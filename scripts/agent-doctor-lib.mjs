import fs from 'node:fs';
import path from 'node:path';

/** @typedef {'ok' | 'warning' | 'error'} DoctorLevel */
/** @typedef {{ level: DoctorLevel }} DoctorCheck */

/** @param {unknown} version @returns {number | null} */
export function parseNodeMajor(version) {
  const match = String(version ?? '').match(/^v?(\d+)/);
  return match ? Number(match[1]) : null;
}

/** @param {unknown} currentVersion @param {number | null} expectedMajor */
export function nodeMajorStatus(currentVersion, expectedMajor) {
  const currentMajor = parseNodeMajor(currentVersion);
  return {
    ok: Number.isInteger(expectedMajor) && currentMajor === expectedMajor,
    currentMajor,
    expectedMajor,
  };
}

/** @param {string | null | undefined} expected @param {string | null | undefined} installed */
export function wranglerVersionStatus(expected, installed) {
  return {
    ok: Boolean(expected && installed && expected === installed),
    expected: expected ?? null,
    installed: installed ?? null,
  };
}

/**
 * Classify branch state while distinguishing an unreadable Git result from a detached HEAD.
 * @param {string | null | undefined} branch
 * @param {boolean} [readable]
 */
export function branchStatus(branch, readable = true) {
  if (!readable) {
    return {
      branch: '(unknown)',
      level: 'error',
      message: 'Git branch state could not be read.',
    };
  }
  if (!branch) {
    return {
      branch: '(detached HEAD)',
      level: 'warning',
      message: 'HEAD is detached; use a named feature branch before editing.',
    };
  }
  if (branch === 'main') {
    return {
      branch,
      level: 'warning',
      message: 'Working directly on main; create a feature branch before editing.',
    };
  }
  return { branch, level: 'ok', message: null };
}

/** @param {DoctorCheck[]} checks @returns {DoctorLevel} */
export function overallDoctorStatus(checks) {
  return checks.some((check) => check.level === 'error') ? 'error' :
    checks.some((check) => check.level === 'warning') ? 'warning' : 'ok';
}

/** @param {string} [startDir] @returns {string | null} */
export function findRepositoryRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
