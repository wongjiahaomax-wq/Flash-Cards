import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classifyChangedFiles } from './agent-checks-lib.mjs';
import { resolveInvocation } from './validate.mjs';
import {
  formatValidationCommand,
  resolveValidationCheckIds,
  VALIDATION_MODE_CHECK_IDS,
  validationCommandsForCheckIds,
} from './validation-contract.mjs';
import { changedFilesFromFeatureDiff } from './validation-git.mjs';

const NODE_TEST_DIAGNOSTIC = /^(not ok|  error:|  code:|  failureType:|  location:|  stack:|    at )/;
const NODE_TEST_CHECK_IDS = new Set([
  'test',
  'testFast',
  'ecgAssetRenameOperatorTest',
  'productionTaxonomyOperatorTest',
  'slideReviewTest',
]);
const ENV_REPORTED_NODE_TEST_CHECK_IDS = new Set([
  'ecgAssetRenameOperatorTest',
  'productionTaxonomyOperatorTest',
  'slideReviewTest',
]);
export const CI_TEST_MAX_BUFFER_BYTES = 64 * 1024 * 1024;
export const CI_TEST_REPORTER = './scripts/ci-test-reporter.mjs';

/** @param {unknown} value */
export function escapeGithubCommandData(value) {
  return String(value ?? '')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

/** @param {unknown} value */
function escapeAgentField(value) {
  return String(value ?? '')
    .replaceAll('%', '%25')
    .replaceAll('|', '%7C')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

/** @param {string} value */
function commandArgument(value) {
  return /^[A-Za-z0-9_./:@+^=-]+$/.test(value) ? value : JSON.stringify(value);
}

/** @param {string} command @param {string[]} args */
function commandText(command, args) {
  return [command, ...args].map(commandArgument).join(' ');
}

/**
 * Produce a command that is meaningful in a normal local feature checkout.
 * The CI diff itself runs against the synthetic merge checkout, but the repro
 * uses the actual PR base/head SHAs supplied by the workflow when available.
 * @param {string} id
 * @param {string} command
 * @param {string[]} args
 * @param {{ diffBaseSha?: string | null, diffHeadSha?: string | null }} [options]
 */
export function ciReproCommand(id, command, args, options = {}) {
  if (id !== 'diff') return commandText(command, args);
  if (options.diffBaseSha && options.diffHeadSha) {
    return commandText('git', ['diff', '--check', options.diffBaseSha, options.diffHeadSha]);
  }
  return 'npm run agent:checks';
}

/**
 * Plain-text records are deliberately kept alongside GitHub annotations so
 * connector-based agents can find the actionable failure without parsing the
 * whole Actions log or relying on GitHub's annotation UI.
 * @param {{ id: string, command: string, args: string[], status?: number | null, message: string, detailedErrorsAlreadyReported?: boolean, reproCommand?: string }} input
 */
export function formatCiAgentFailureSummary(input) {
  const check = escapeAgentField(input.id);
  const lines = ['=== CI AGENT SUMMARY ==='];
  if (!input.detailedErrorsAlreadyReported) {
    lines.push(`CI_ERROR|check=${check}|message=${escapeAgentField(input.message)}`);
  }
  const reproCommand = input.reproCommand ?? commandText(input.command, input.args);
  lines.push(`CI_REPRO|check=${check}|command=${escapeAgentField(reproCommand)}`);
  const exit = Number.isInteger(input.status) ? `|exit=${input.status}` : '';
  lines.push(`CI_STATUS|check=${check}|status=failed${exit}`);
  return lines.join('\n');
}

/**
 * Legacy compatibility helper retained for tooling tests from the previous
 * TAP-based implementation. The active CI path no longer parses test text.
 * @param {string} output
 */
export function extractNodeTestDiagnostic(output) {
  const diagnostic = String(output ?? '')
    .split(/\r?\n/)
    .filter((line) => NODE_TEST_DIAGNOSTIC.test(line))
    .join('\n')
    .trim();
  return diagnostic || 'npm test failed; see the grouped Node test output.';
}

/** @param {string} mode */
function assertCiValidationMode(mode) {
  if (!mode) {
    throw new Error(`CI validation mode must be non-empty. Expected one of: ${Object.keys(VALIDATION_MODE_CHECK_IDS).join(', ')}.`);
  }
  if (!Object.hasOwn(VALIDATION_MODE_CHECK_IDS, mode)) {
    throw new Error(`Unknown CI validation mode: ${mode}. Expected one of: ${Object.keys(VALIDATION_MODE_CHECK_IDS).join(', ')}.`);
  }
}

/**
 * @param {string[]} argv
 * @returns {{ mode: string, diffBase: string, diffHead: string }}
 */
export function parseCiArgs(argv) {
  let mode = 'full';
  let diffBase = 'HEAD^1';
  let diffHead = 'HEAD';
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode') {
      mode = argv[index + 1] ?? '';
      assertCiValidationMode(mode);
      index += 1;
    } else if (arg === '--diff-base') {
      diffBase = argv[index + 1] ?? '';
      index += 1;
    } else if (arg === '--diff-head') {
      diffHead = argv[index + 1] ?? '';
      index += 1;
    } else {
      throw new Error(`Unknown CI validation argument: ${arg}`);
    }
  }
  if (!diffBase || !diffHead) throw new Error('CI diff base/head must be non-empty.');
  return { mode, diffBase, diffHead };
}

/**
 * Resolve the repository-owned base mode plus specialized requirements from the
 * same changed-path classifier used by agent:checks.
 * @param {{ mode?: string, changedFiles?: string[] }} [options]
 */
export function ciValidationPlan(options = {}) {
  const mode = options.mode ?? 'full';
  assertCiValidationMode(mode);
  const classification = classifyChangedFiles(options.changedFiles ?? []);
  const checkIds = resolveValidationCheckIds(
    VALIDATION_MODE_CHECK_IDS[mode],
    classification.specializedRequiredChecks,
  );
  return {
    mode,
    changedFiles: classification.files,
    classification,
    checkIds,
  };
}

/**
 * CI uses the shared repository validation definitions while keeping
 * PR-checkout diff semantics CI-specific.
 * @param {{ mode?: string, diffBase?: string, diffHead?: string, changedFiles?: string[] }} [options]
 */
export function ciValidationCommands(options = {}) {
  const diffBase = options.diffBase ?? 'HEAD^1';
  const diffHead = options.diffHead ?? 'HEAD';
  const plan = ciValidationPlan(options);
  return validationCommandsForCheckIds(plan.checkIds, {
    diffArgs: ['diff', '--check', diffBase, diffHead],
  });
}

/**
 * CI classifies the actual full PR feature diff when PR base/head SHAs are
 * available. The synthetic checkout diff remains a fallback for direct use.
 * @param {{ root?: string, changedFiles?: string[], diffBase?: string, diffHead?: string, diffReproBaseSha?: string | null, diffReproHeadSha?: string | null }} [options]
 */
export function resolveCiChangedFiles(options = {}) {
  if (options.changedFiles) return classifyChangedFiles(options.changedFiles).files;
  const base = options.diffReproBaseSha ?? process.env.CI_PR_BASE_SHA ?? options.diffBase ?? 'HEAD^1';
  const head = options.diffReproHeadSha ?? process.env.CI_PR_HEAD_SHA ?? options.diffHead ?? 'HEAD';
  return changedFilesFromFeatureDiff(options.root ?? process.cwd(), base, head);
}

/** @param {string} id */
export function isCiNodeTestCheck(id) {
  return NODE_TEST_CHECK_IDS.has(id);
}

/** @param {string} id @param {string[]} args */
export function ciCommandArgs(id, args) {
  if (id !== 'test' && id !== 'testFast') return [...args];
  return [...args, '--', `--test-reporter=${CI_TEST_REPORTER}`];
}

/**
 * Named specialized Node checks put explicit test files after `node --test`
 * directly or through an npm script. NODE_OPTIONS applies the CI-only reporter
 * before those positional arguments while preserving the named command. The
 * reporter identity and repro command are derived from validation-contract.mjs.
 * Base test/testFast reporter behavior remains unchanged.
 * @param {string} id
 * @param {NodeJS.ProcessEnv} [env]
 */
export function ciCommandEnvironment(id, env = process.env) {
  if (!ENV_REPORTED_NODE_TEST_CHECK_IDS.has(id)) return { ...env };
  const existing = String(env.NODE_OPTIONS ?? '').trim();
  return {
    ...env,
    CI_NODE_TEST_CHECK_ID: id,
    CI_NODE_TEST_REPRO_COMMAND: formatValidationCommand(id),
    NODE_OPTIONS: [existing, `--test-reporter=${CI_TEST_REPORTER}`].filter(Boolean).join(' '),
  };
}

/**
 * CI keeps PR-checkout diff semantics and GitHub grouping CI-specific while
 * reusing the repository validation contract. Node-test diagnostics are
 * produced by a custom reporter that consumes structured node:test events.
 * @param {{ mode?: string, root?: string, diffBase?: string, diffHead?: string, changedFiles?: string[], diffReproBaseSha?: string | null, diffReproHeadSha?: string | null }} [options]
 */
export function runCiValidation(options = {}) {
  const mode = options.mode ?? 'full';
  const changedFiles = resolveCiChangedFiles(options);
  const plan = ciValidationPlan({ mode, changedFiles });
  const checks = ciValidationCommands({ ...options, mode, changedFiles });
  const diffReproBaseSha = options.diffReproBaseSha ?? process.env.CI_PR_BASE_SHA ?? null;
  const diffReproHeadSha = options.diffReproHeadSha ?? process.env.CI_PR_HEAD_SHA ?? null;

  console.log(`Repository CI validation mode: ${mode}`);
  console.log(`Repository CI changed paths: ${plan.changedFiles.length}`);
  console.log(`Repository CI specialized requirements: ${plan.classification.specializedRequiredChecks.join(', ') || '(none)'}`);
  console.log(`Repository CI checks: ${plan.checkIds.join(', ')}`);
  for (const { id, label, command, args } of checks) {
    console.log(`::group::${label}`);
    const invocation = resolveInvocation(command, ciCommandArgs(id, args));
    const result = spawnSync(invocation.executable, invocation.args, {
      stdio: 'inherit',
      shell: false,
      env: ciCommandEnvironment(id),
    });
    console.log('::endgroup::');
    const reproCommand = ciReproCommand(id, command, args, {
      diffBaseSha: diffReproBaseSha,
      diffHeadSha: diffReproHeadSha,
    });

    if (result.error) {
      const detail = result.error.message;
      console.error(`::error title=${label} failed::${escapeGithubCommandData(detail)}`);
      console.error(formatCiAgentFailureSummary({
        id,
        command,
        args,
        message: detail,
        reproCommand,
      }));
      return 1;
    }
    if (result.status !== 0) {
      const nodeTestCheck = isCiNodeTestCheck(id);
      const detail = nodeTestCheck
        ? `${reproCommand} failed; see the structured Node test failure summary above.`
        : `${command} ${args.join(' ')} exited with ${result.status}.`;
      const title = nodeTestCheck ? 'Node test failure' : `${label} failed`;
      console.error(`::error title=${title}::${escapeGithubCommandData(detail)}`);
      console.error(formatCiAgentFailureSummary({
        id,
        command,
        args,
        status: result.status,
        message: detail,
        detailedErrorsAlreadyReported: nodeTestCheck,
        reproCommand,
      }));
      return result.status ?? 1;
    }
  }

  console.log('Repository CI validation passed.');
  return 0;
}

const invokedDirectly = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) {
  try {
    const options = parseCiArgs(process.argv.slice(2));
    process.exitCode = runCiValidation(options);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`::error title=CI validation configuration error::${escapeGithubCommandData(detail)}`);
    console.error(formatCiAgentFailureSummary({
      id: 'configuration',
      command: 'node',
      args: ['scripts/validate-ci.mjs', ...process.argv.slice(2)],
      status: 2,
      message: detail,
    }));
    process.exitCode = 2;
  }
}
