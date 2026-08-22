import fs from 'node:fs';
import path from 'node:path';

export function parseNodeMajor(version) {
  const match = String(version ?? '').match(/^v?(\d+)/);
  return match ? Number(match[1]) : null;
}

export function nodeMajorStatus(currentVersion, expectedMajor) {
  const currentMajor = parseNodeMajor(currentVersion);
  return {
    ok: currentMajor === expectedMajor,
    currentMajor,
    expectedMajor,
  };
}

export function wranglerVersionStatus(expected, installed) {
  return {
    ok: Boolean(expected && installed && expected === installed),
    expected: expected ?? null,
    installed: installed ?? null,
  };
}

export function branchStatus(branch) {
  return {
    branch: branch || '(detached/unknown)',
    warning: branch === 'main' ? 'Working directly on main; create a feature branch before editing.' : null,
  };
}

export function overallDoctorStatus(checks) {
  return checks.some((check) => check.level === 'error') ? 'error' :
    checks.some((check) => check.level === 'warning') ? 'warning' : 'ok';
}

export function findRepositoryRoot(startDir = process.cwd()) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, '.git'))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}
