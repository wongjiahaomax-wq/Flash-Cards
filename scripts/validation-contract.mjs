/**
 * Repository-owned validation definitions.
 * Local validation, CI validation, and agent:checks all consume this data.
 */

/** @typedef {{ label: string, command: string, args: readonly string[], satisfies?: readonly string[] }} ValidationCheck */
/** @typedef {{ id: string, label: string, command: string, args: string[] }} ValidationCommand */

/** @type {Readonly<Record<string, ValidationCheck>>} */
export const VALIDATION_CHECKS = Object.freeze({
  diff: Object.freeze({
    label: 'Check diff whitespace',
    command: 'git',
    args: Object.freeze(['diff', '--check']),
  }),
  db: Object.freeze({
    label: 'Check database migrations',
    command: 'npm',
    args: Object.freeze(['run', 'db:check']),
  }),
  test: Object.freeze({
    label: 'Run Node tests',
    command: 'npm',
    args: Object.freeze(['test']),
    satisfies: Object.freeze(['testFast', 'slideReviewTest']),
  }),
  testFast: Object.freeze({
    label: 'Run fast Node tests',
    command: 'npm',
    args: Object.freeze(['run', 'test:fast']),
  }),
  svelte: Object.freeze({
    label: 'Run Svelte checks',
    command: 'npm',
    args: Object.freeze(['run', 'check']),
  }),
  build: Object.freeze({
    label: 'Build application',
    command: 'npm',
    args: Object.freeze(['run', 'build']),
  }),
  authSmoke: Object.freeze({
    label: 'Smoke test local D1 and Better Auth',
    command: 'node',
    args: Object.freeze(['scripts/local-auth-smoke.mjs']),
  }),
  runtimeSmoke: Object.freeze({
    label: 'Smoke test repository-pinned Wrangler runtime',
    command: 'npm',
    args: Object.freeze(['run', 'runtime:smoke']),
  }),
  slideReviewTest: Object.freeze({
    label: 'Run slide-review tooling tests',
    command: 'npm',
    args: Object.freeze(['run', 'slide-review:test']),
  }),
  slideReviewBuild: Object.freeze({
    label: 'Build slide-review tooling',
    command: 'npm',
    args: Object.freeze(['run', 'slide-review:build']),
  }),
});

export const VALIDATION_CHECK_ORDER = Object.freeze([
  'diff',
  'db',
  'test',
  'testFast',
  'svelte',
  'build',
  'authSmoke',
  'runtimeSmoke',
  'slideReviewTest',
  'slideReviewBuild',
]);

export const SPECIALIZED_CHECK_IDS = Object.freeze([
  'runtimeSmoke',
  'slideReviewTest',
  'slideReviewBuild',
]);

// Ordinary CI currently takes ownership of slide-review specialization. Runtime
// smoke remains enforced by its existing path-filtered workflow and agent advice.
export const CI_SPECIALIZED_CHECK_IDS = Object.freeze([
  'slideReviewTest',
  'slideReviewBuild',
]);

/** @type {Readonly<Record<string, readonly string[]>>} */
export const VALIDATION_MODE_CHECK_IDS = Object.freeze({
  fast: Object.freeze(['diff', 'testFast', 'svelte']),
  full: Object.freeze(['diff', 'db', 'test', 'svelte', 'build', 'authSmoke']),
});

/** @param {string} checkId @returns {ValidationCheck} */
export function validationCheck(checkId) {
  const check = VALIDATION_CHECKS[checkId];
  if (!check) throw new Error(`Unknown validation check: ${checkId}`);
  return check;
}

/** @param {string} providerId @param {string} requiredId */
export function validationCheckSatisfies(providerId, requiredId) {
  const provider = validationCheck(providerId);
  validationCheck(requiredId);
  return providerId === requiredId || (provider.satisfies?.includes(requiredId) ?? false);
}

/**
 * Combine base validation with changed-path requirements, then remove checks
 * whose coverage is explicitly satisfied by another selected check.
 * @param {readonly string[]} baseCheckIds
 * @param {readonly string[]} [requiredCheckIds]
 */
export function resolveValidationCheckIds(baseCheckIds, requiredCheckIds = []) {
  const base = [...new Set(baseCheckIds)];
  const requested = [...new Set([...base, ...requiredCheckIds])];
  for (const checkId of requested) validationCheck(checkId);

  const baseSet = new Set(base);
  const selected = new Set(requested);
  for (const requiredId of requested) {
    if (baseSet.has(requiredId)) continue;
    for (const providerId of requested) {
      if (providerId === requiredId) continue;
      if (validationCheckSatisfies(providerId, requiredId)) {
        selected.delete(requiredId);
        break;
      }
    }
  }

  const ordered = VALIDATION_CHECK_ORDER.filter((checkId) => selected.has(checkId));
  if (ordered.length !== selected.size) {
    const missing = [...selected].filter((checkId) => !VALIDATION_CHECK_ORDER.includes(checkId));
    throw new Error(`Validation check order is missing configured checks: ${missing.join(', ')}`);
  }
  return ordered;
}

/**
 * @param {string} checkId
 * @param {{ diffArgs?: string[] }} [options]
 * @returns {ValidationCommand}
 */
export function validationCommand(checkId, options = {}) {
  const check = validationCheck(checkId);
  const args = checkId === 'diff' && options.diffArgs ? options.diffArgs : check.args;
  return {
    id: checkId,
    label: check.label,
    command: check.command,
    args: [...args],
  };
}

/**
 * @param {readonly string[]} checkIds
 * @param {{ diffArgs?: string[] }} [options]
 * @returns {ValidationCommand[]}
 */
export function validationCommandsForCheckIds(checkIds, options = {}) {
  return checkIds.map((checkId) => validationCommand(checkId, options));
}

/**
 * @param {string} mode
 * @param {{ diffArgs?: string[] }} [options]
 * @returns {ValidationCommand[]}
 */
export function validationCommandsForMode(mode, options = {}) {
  const checkIds = VALIDATION_MODE_CHECK_IDS[mode];
  if (!checkIds) throw new Error(`Unknown validation mode: ${mode}`);
  return validationCommandsForCheckIds(checkIds, options);
}

/** @param {string} checkId */
export function formatValidationCommand(checkId) {
  const { command, args } = validationCommand(checkId);
  return `${command} ${args.join(' ')}`;
}
