import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  NPM_CI_ARGS,
  dependencyFingerprint,
  dependencyReuseStatus,
  ensureDependencies,
  parseDepsEnsureArgs,
  resolveNpmCiInvocation,
  writeDependencyStamp,
} from '../scripts/deps-ensure.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const workflowPaths = [
  '.github/workflows/apply-agreed-production-taxonomy.yml',
  '.github/workflows/ci.yml',
  '.github/workflows/deploy-pr-to-preview.yml',
  '.github/workflows/deploy-production.yml',
  '.github/workflows/learner-fsrs-active-review-benchmark.yml',
  '.github/workflows/learner-fsrs-browser-benchmark.yml',
  '.github/workflows/learner-fsrs-free-study.yml',
  '.github/workflows/learner-fsrs-scheduled-completion.yml',
  '.github/workflows/learner-fsrs-workerd-smoke.yml',
  '.github/workflows/production-content-snapshot.yml',
  '.github/workflows/rename-ecg-batch-01-assets.yml',
  '.github/workflows/restore-main-to-preview.yml',
  '.github/workflows/wrangler-runtime-smoke.yml',
];

/** @param {string} fixture @param {string} [suffix] */
function writeFixturePackage(fixture, suffix = '') {
  fs.writeFileSync(path.join(fixture, 'package.json'), JSON.stringify({ name: `fixture${suffix}` }));
  fs.writeFileSync(path.join(fixture, 'package-lock.json'), JSON.stringify({ name: 'fixture', lockfileVersion: 3 }));
}

test('dependency-installing workflows use the shared Node/npm cache and install contract', () => {
  for (const workflowPath of workflowPaths) {
    const workflow = fs.readFileSync(path.join(root, workflowPath), 'utf8');
    assert.match(workflow, /uses: actions\/setup-node@v5[\s\S]*?with:\n\s+node-version: 22\n\s+cache: npm\n\s+cache-dependency-path: package-lock\.json/, `${workflowPath} should use the shared setup-node cache contract`);
    assert.match(workflow, /run: npm ci --prefer-offline --no-audit --no-fund/, `${workflowPath} should use the optimized clean install command`);
    assert.doesNotMatch(workflow, /cache:\s*node_modules/, `${workflowPath} must not cache node_modules`);
  }
});

test('ordinary PR CI still cancels obsolete runs for the same pull request', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8');
  assert.match(workflow, /group: \$\{\{ github\.workflow \}\}-pr-\$\{\{ github\.event\.pull_request\.number \}\}/);
  assert.match(workflow, /cancel-in-progress: true/);
});

test('deps:ensure is exposed as the repository dependency preparation command', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.scripts['deps:ensure'], 'node scripts/deps-ensure.mjs');
});

test('dependency reuse requires a matching package/runtime fingerprint', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-deps-'));
  try {
    writeFixturePackage(fixture);
    const runtime = { modules: '127', platform: 'linux', arch: 'x64' };
    const fingerprint = dependencyFingerprint(fixture, runtime);

    assert.equal(dependencyReuseStatus(fixture, fingerprint).reusable, false);
    fs.mkdirSync(path.join(fixture, 'node_modules'));
    assert.equal(dependencyReuseStatus(fixture, fingerprint).reusable, false);

    writeDependencyStamp(fixture, fingerprint);
    assert.equal(dependencyReuseStatus(fixture, fingerprint).reusable, true);

    writeFixturePackage(fixture, '-changed');
    const changedPackageFingerprint = dependencyFingerprint(fixture, runtime);
    assert.notEqual(changedPackageFingerprint, fingerprint);
    assert.equal(dependencyReuseStatus(fixture, changedPackageFingerprint).reusable, false);

    const changedRuntimeFingerprint = dependencyFingerprint(fixture, { ...runtime, modules: '128' });
    assert.notEqual(changedRuntimeFingerprint, changedPackageFingerprint);
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('deps:ensure skips matching installs and force mode uses the optimized npm ci arguments', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'flash-cards-deps-run-'));
  try {
    writeFixturePackage(fixture);
    fs.mkdirSync(path.join(fixture, 'node_modules'));
    writeDependencyStamp(fixture);

    let spawnCalls = 0;
    assert.equal(ensureDependencies(fixture, {
      spawn: () => {
        spawnCalls += 1;
        return { status: 0 };
      },
    }), 0);
    assert.equal(spawnCalls, 0);

    /** @type {{ executable: string, args: string[] } | null} */
    let invocation = null;
    assert.equal(ensureDependencies(fixture, {
      force: true,
      env: { npm_execpath: '/tmp/npm-cli.js' },
      platform: 'linux',
      spawn: (executable, args) => {
        invocation = { executable, args };
        return { status: 0 };
      },
    }), 0);
    assert.deepEqual(invocation, {
      executable: process.execPath,
      args: ['/tmp/npm-cli.js', ...NPM_CI_ARGS],
    });
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});

test('deps:ensure argument and npm invocation parsing are deterministic', () => {
  assert.deepEqual(parseDepsEnsureArgs([]), { force: false });
  assert.deepEqual(parseDepsEnsureArgs(['--force']), { force: true });
  assert.throws(() => parseDepsEnsureArgs(['--refresh']), /Unknown argument: --refresh/);

  assert.deepEqual(resolveNpmCiInvocation({ npm_execpath: '/npm/npm-cli.js' }, 'linux'), {
    executable: process.execPath,
    args: ['/npm/npm-cli.js', ...NPM_CI_ARGS],
  });
  assert.deepEqual(resolveNpmCiInvocation({}, 'win32'), {
    executable: 'npm.cmd',
    args: [...NPM_CI_ARGS],
  });
});
