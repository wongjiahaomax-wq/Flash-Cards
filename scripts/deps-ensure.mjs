import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { findRepositoryRoot } from './agent-doctor-lib.mjs';

export const DEPENDENCY_STAMP_FILENAME = '.flash-cards-deps-fingerprint';
export const NPM_CI_ARGS = ['ci', '--prefer-offline', '--no-audit', '--no-fund'];

/** @typedef {Record<string, string | undefined>} StringEnvironment */
/** @typedef {{ status: number | null, error?: Error }} SpawnResult */
/** @typedef {(executable: string, args: string[], options: { cwd: string, stdio: 'inherit', env: StringEnvironment }) => SpawnResult} SpawnCommand */

/** @type {SpawnCommand} */
const defaultSpawn = (executable, args, options) => spawnSync(executable, args, {
  ...options,
  env: /** @type {NodeJS.ProcessEnv} */ (options.env),
});

/** @param {string[]} argv */
export function parseDepsEnsureArgs(argv) {
  let force = false;
  for (const arg of argv) {
    if (arg === '--force') {
      force = true;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }
  return { force };
}

/**
 * @param {string} root
 * @param {{ modules?: string, platform?: string, arch?: string }} [runtime]
 */
export function dependencyFingerprint(root, runtime = {}) {
  const hash = createHash('sha256');
  for (const filename of ['package.json', 'package-lock.json']) {
    hash.update(filename);
    hash.update('\0');
    hash.update(fs.readFileSync(path.join(root, filename)));
    hash.update('\0');
  }
  hash.update(String(runtime.modules ?? process.versions.modules ?? ''));
  hash.update('\0');
  hash.update(String(runtime.platform ?? process.platform));
  hash.update('\0');
  hash.update(String(runtime.arch ?? process.arch));
  return hash.digest('hex');
}

/** @param {string} root */
export function dependencyStampPath(root) {
  return path.join(root, 'node_modules', DEPENDENCY_STAMP_FILENAME);
}

/** @param {string} root @param {string} [fingerprint] */
export function dependencyReuseStatus(root, fingerprint = dependencyFingerprint(root)) {
  const nodeModulesPath = path.join(root, 'node_modules');
  const stampPath = dependencyStampPath(root);
  if (!fs.existsSync(nodeModulesPath)) {
    return { reusable: false, reason: 'node_modules is missing', fingerprint, stampPath };
  }
  if (!fs.existsSync(stampPath)) {
    return { reusable: false, reason: 'dependency reuse stamp is missing', fingerprint, stampPath };
  }

  let recorded;
  try {
    recorded = fs.readFileSync(stampPath, 'utf8').trim();
  } catch {
    return { reusable: false, reason: 'dependency reuse stamp is unreadable', fingerprint, stampPath };
  }
  if (recorded !== fingerprint) {
    return { reusable: false, reason: 'package metadata or runtime fingerprint changed', fingerprint, stampPath };
  }
  return { reusable: true, reason: 'dependency fingerprint matches', fingerprint, stampPath };
}

/** @param {string} root @param {string} [fingerprint] */
export function writeDependencyStamp(root, fingerprint = dependencyFingerprint(root)) {
  const nodeModulesPath = path.join(root, 'node_modules');
  fs.mkdirSync(nodeModulesPath, { recursive: true });
  const stampPath = dependencyStampPath(root);
  fs.writeFileSync(stampPath, `${fingerprint}\n`);
  return stampPath;
}

/** @param {StringEnvironment} [env] @param {NodeJS.Platform} [platform] */
export function resolveNpmCiInvocation(env = process.env, platform = process.platform) {
  if (env.npm_execpath) {
    return {
      executable: process.execPath,
      args: [env.npm_execpath, ...NPM_CI_ARGS],
    };
  }
  return {
    executable: platform === 'win32' ? 'npm.cmd' : 'npm',
    args: [...NPM_CI_ARGS],
  };
}

/**
 * @param {string} root
 * @param {{ force?: boolean, spawn?: SpawnCommand, env?: StringEnvironment, platform?: NodeJS.Platform }} [options]
 */
export function ensureDependencies(root, options = {}) {
  const force = options.force ?? false;
  const spawn = options.spawn ?? defaultSpawn;
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const fingerprint = dependencyFingerprint(root);
  const status = dependencyReuseStatus(root, fingerprint);

  if (status.reusable && !force) {
    console.log('Dependencies match package.json/package-lock.json and the current Node runtime; skipping npm ci.');
    return 0;
  }

  console.log(force ? 'Dependency refresh forced.' : `Dependency refresh required: ${status.reason}.`);
  fs.rmSync(status.stampPath, { force: true });

  const invocation = resolveNpmCiInvocation(env, platform);
  console.log(`Running npm ${NPM_CI_ARGS.join(' ')}`);
  const result = spawn(invocation.executable, invocation.args, {
    cwd: root,
    stdio: 'inherit',
    env,
  });
  if (result.error) {
    console.error(`ERROR: npm ci could not be started: ${result.error.message}`);
    return 1;
  }
  if (result.status !== 0) {
    console.error(`ERROR: npm ci failed with exit code ${result.status ?? 'unknown'}.`);
    return Number.isInteger(result.status) ? result.status : 1;
  }

  writeDependencyStamp(root, dependencyFingerprint(root));
  console.log('Dependencies installed and dependency reuse stamp updated.');
  return 0;
}

function main() {
  try {
    const root = findRepositoryRoot();
    if (!root) throw new Error('repository root could not be detected. Run this command from inside the Flash-Cards checkout.');
    const { force } = parseDepsEnsureArgs(process.argv.slice(2));
    return ensureDependencies(root, { force });
  } catch (error) {
    console.error(`ERROR: ${error instanceof Error ? error.message : String(error)}`);
    return 1;
  }
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) process.exitCode = main();
