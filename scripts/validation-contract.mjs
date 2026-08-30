/**
 * Repository-owned validation definitions.
 * Local validation, CI validation, and agent:checks all consume this data.
 */

/** @typedef {{ label: string, command: string, args: readonly string[] }} ValidationCheck */
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
 * @param {string} mode
 * @param {{ diffArgs?: string[] }} [options]
 * @returns {ValidationCommand[]}
 */
export function validationCommandsForMode(mode, options = {}) {
  const checkIds = VALIDATION_MODE_CHECK_IDS[mode];
  if (!checkIds) throw new Error(`Unknown validation mode: ${mode}`);
  return checkIds.map((checkId) => validationCommand(checkId, options));
}

/** @param {string} checkId */
export function formatValidationCommand(checkId) {
  const { command, args } = validationCommand(checkId);
  return `${command} ${args.join(' ')}`;
}
