import {
  CI_SPECIALIZED_CHECK_IDS,
  formatValidationCommand,
  SPECIALIZED_CHECK_IDS,
  VALIDATION_CHECK_ORDER,
  VALIDATION_MODE_CHECK_IDS,
} from './validation-contract.mjs';
import { isMaintainedNodeTestPath } from './test-selection.mjs';

const ORDINARY_FULL_CHECKS = VALIDATION_MODE_CHECK_IDS.full;

/** @typedef {{ id: string, area: string, patterns: readonly RegExp[], excludePatterns?: readonly RegExp[], required: readonly string[], specializedRequired?: readonly string[], recommendations?: readonly string[], iteration?: readonly string[], checkpoint?: readonly string[] }} ValidationRule */

const FOCUSED_LOGIC_ITERATION = 'Iteration: run the nearest directly related test file(s) first; do not rerun the broad handoff suite after every small edit.';
const COMPACT_CHECKPOINT = 'Checkpoint: after a coherent batch, use npm run validate:fast -- --compact when broader repository confidence is useful.';

/** @type {ReadonlyArray<ValidationRule>} */
export const VALIDATION_RULES = Object.freeze([
  Object.freeze({
    id: 'admin-svelte',
    area: 'Admin / Svelte routes',
    patterns: Object.freeze([/^src\/routes\/admin\//, /\.svelte$/]),
    required: Object.freeze(['diff', 'test', 'svelte', 'build']),
    iteration: Object.freeze([
      'Iteration: for presentation-only copy, spacing, classes, and layout, batch edits under npm run dev / Vite HMR; do not run repository validation after every edit.',
      'Iteration: when component logic, action wiring, or data flow changes, run the nearest directly related test file(s) first.',
    ]),
    checkpoint: Object.freeze([
      'Checkpoint: after a coherent Svelte/logic batch, run npm run check; use npm run validate:fast -- --compact only when broader repository confidence is useful.',
    ]),
    recommendations: Object.freeze(['Manual: run npm run dev and inspect the affected Admin or Svelte flow locally.']),
  }),
  Object.freeze({
    id: 'schema-migrations',
    area: 'Database schema / migrations',
    patterns: Object.freeze([/^drizzle\//, /^drizzle\.config\.js$/, /^src\/lib\/server\/db\/schema\.js$/]),
    required: Object.freeze(['diff', 'db', 'test', 'svelte', 'build']),
    iteration: Object.freeze([
      'Iteration: after a coherent schema/migration edit, run npm run db:check plus the directly related migration/schema test file(s); rerun them only when later edits can invalidate them.',
    ]),
    checkpoint: Object.freeze([COMPACT_CHECKPOINT]),
  }),
  Object.freeze({
    id: 'database-code',
    area: 'Database read/write logic',
    patterns: Object.freeze([/^src\/lib\/server\/db\//]),
    excludePatterns: Object.freeze([/^src\/lib\/server\/db\/schema\.js$/, /\/AGENTS\.md$/]),
    required: Object.freeze(['diff', 'db', 'test', 'svelte', 'build']),
    iteration: Object.freeze([
      'Iteration: run the directly related DB/read-model behavioral test file(s) first; unrelated UI/build checks are not an every-edit loop.',
    ]),
    checkpoint: Object.freeze([COMPACT_CHECKPOINT]),
  }),
  Object.freeze({
    id: 'authentication',
    area: 'Authentication / Better Auth',
    patterns: Object.freeze([
      /^src\/lib\/server\/auth\.js$/,
      /^src\/lib\/server\/preview-auth\.js$/,
      /^src\/hooks\.server\.js$/,
      /^src\/routes\/api\/auth\//,
      /^scripts\/local-auth-smoke\.mjs$/,
    ]),
    required: Object.freeze(['diff', 'test', 'svelte', 'build', 'authSmoke']),
    iteration: Object.freeze([
      'Iteration: run the directly related auth/security test file(s) first; do not run the complete repository suite after each correction.',
    ]),
    checkpoint: Object.freeze([
      'Checkpoint: exercise the local auth smoke after a coherent auth/runtime batch, then use compact repository validation when broader confidence is needed.',
    ]),
  }),
  Object.freeze({
    id: 'runtime-toolchain',
    area: 'Wrangler / runtime / toolchain',
    patterns: Object.freeze([
      /^package\.json$/,
      /^package-lock\.json$/,
      /^\.node-version$/,
      /^wrangler\.jsonc$/,
      /^svelte\.config\.js$/,
      /^vite\.config\.(?:js|mjs|ts)$/,
      /^scripts\/wrangler-runtime-smoke(?:-lib)?\.mjs$/,
      /^scripts\/local-dev\.mjs$/,
      /^scripts\/local-preview\.mjs$/,
      /^\.github\/workflows\/(?:wrangler-runtime-smoke|deploy-production|deploy-pr-to-preview|restore-main-to-preview)\.yml$/,
    ]),
    required: Object.freeze([...ORDINARY_FULL_CHECKS, 'runtimeSmoke']),
    iteration: Object.freeze([FOCUSED_LOGIC_ITERATION]),
    checkpoint: Object.freeze([
      'Checkpoint: run npm run runtime:smoke once the runtime/toolchain change is coherent; do not use it as an every-edit loop.',
    ]),
  }),
  Object.freeze({
    id: 'local-replica',
    area: 'Local production-like replica tooling',
    patterns: Object.freeze([
      /^scripts\/refresh-local-replica(?:-lib)?\.mjs$/,
      /^scripts\/local-replica-lib\.mjs$/,
      /^scripts\/bootstrap-local-admin(?:-lib)?\.mjs$/,
    ]),
    required: Object.freeze(['diff', 'test']),
    iteration: Object.freeze([FOCUSED_LOGIC_ITERATION]),
    checkpoint: Object.freeze([COMPACT_CHECKPOINT]),
    recommendations: Object.freeze([
      'Credential-dependent: when authorized local credentials/state are available, exercise the affected local-replica command; do not access production automatically.',
    ]),
  }),
  Object.freeze({
    id: 'ecg-asset-rename-operator',
    area: 'ECG Batch 01 production operator',
    patterns: Object.freeze([
      /^scripts\/rename-ecg-batch-01-assets\.mjs$/,
      /^scripts\/ecg-batch-01-asset-rename-targets\.mjs$/,
      /^test\/ecg-batch-01-asset-rename\.test\.js$/,
    ]),
    required: Object.freeze(['diff']),
    specializedRequired: Object.freeze(['ecgAssetRenameOperatorTest']),
    iteration: Object.freeze(['Iteration: run the named ECG Asset rename operator test after operator logic changes.']),
  }),
  Object.freeze({
    id: 'production-taxonomy-operator',
    area: 'Production taxonomy operator',
    patterns: Object.freeze([
      /^scripts\/apply-agreed-taxonomy\.mjs$/,
      /^test\/production-taxonomy-operator\.test\.js$/,
    ]),
    required: Object.freeze(['diff']),
    specializedRequired: Object.freeze(['productionTaxonomyOperatorTest']),
    iteration: Object.freeze(['Iteration: run the named production taxonomy operator test after operator logic changes; never execute the production mutation as a test.']),
  }),
  Object.freeze({
    id: 'slide-review-production-contract',
    area: 'Slide-review production compatibility',
    patterns: Object.freeze([
      /^src\/lib\/server\/import\/content-package\.js$/,
      /^src\/lib\/server\/import\/reviewed-content-package\.js$/,
      /^src\/lib\/server\/storage\/media\.js$/,
    ]),
    required: Object.freeze(['diff']),
    specializedRequired: Object.freeze(['slideReviewTest']),
    iteration: Object.freeze(['Iteration: run npm run slide-review:test after changes that can affect the slide-review production compatibility contract.']),
  }),
  Object.freeze({
    id: 'slide-review',
    area: 'Slide-review tooling',
    patterns: Object.freeze([/^tools\/slide-import-review\//]),
    required: Object.freeze(['diff']),
    specializedRequired: Object.freeze(['slideReviewTest', 'slideReviewBuild']),
    iteration: Object.freeze(['Iteration: run the directly related slide-review test(s) first; defer the tooling build until a coherent checkpoint unless build behavior itself changed.']),
    checkpoint: Object.freeze(['Checkpoint: run npm run slide-review:test and npm run slide-review:build before handoff.']),
  }),
  Object.freeze({
    id: 'github-automation',
    area: 'GitHub workflows / automation',
    patterns: Object.freeze([/^\.github\//]),
    excludePatterns: Object.freeze([/^\.github\/AGENTS\.md$/]),
    required: Object.freeze(['diff']),
    iteration: Object.freeze(['Iteration: inspect the changed workflow/automation directly; do not emulate GitHub Actions locally unless the repository already provides that mechanism.']),
    recommendations: Object.freeze([
      'Manual: review the changed workflow/automation in GitHub after push and confirm the relevant Actions run; do not emulate GitHub Actions locally unless an established repository mechanism exists.',
    ]),
  }),
  Object.freeze({
    id: 'validation-tooling',
    area: 'Coding-agent / validation tooling',
    patterns: Object.freeze([
      /^scripts\/agent-(?:checks|doctor)(?:-lib)?\.mjs$/,
      /^scripts\/ci-test-reporter\.mjs$/,
      /^scripts\/test-(?:fast|selection)\.mjs$/,
      /^scripts\/validate(?:-ci)?\.mjs$/,
      /^scripts\/validation-(?:contract|git)\.mjs$/,
      /^tests\/agent-tooling\.test\.js$/,
    ]),
    required: Object.freeze([...ORDINARY_FULL_CHECKS]),
    specializedRequired: Object.freeze([...CI_SPECIALIZED_CHECK_IDS]),
    iteration: Object.freeze(['Iteration: run the directly related agent-tooling/validation test file(s) first; preserve shared validation semantics while iterating.']),
    checkpoint: Object.freeze([COMPACT_CHECKPOINT]),
  }),
  Object.freeze({
    id: 'ci-validation-infrastructure',
    area: 'CI validation infrastructure',
    patterns: Object.freeze([
      /^package\.json$/,
      /^package-lock\.json$/,
      /^\.github\/workflows\/ci\.yml$/,
      /^tests\/(?:ci-change-aware|ci-test-reporter|test-selection)\.test\.js$/,
    ]),
    required: Object.freeze([]),
    specializedRequired: Object.freeze([...CI_SPECIALIZED_CHECK_IDS]),
    iteration: Object.freeze(['Iteration: run the directly related CI/selection contract test file(s) before relying on a new Actions run.']),
  }),
  Object.freeze({
    id: 'tests',
    area: 'Automated tests',
    patterns: Object.freeze([/^tests\//]),
    excludePatterns: Object.freeze([/^tests\/agent-tooling\.test\.js$/]),
    required: Object.freeze(['diff', 'test']),
    iteration: Object.freeze(['Iteration: execute changed or directly implicated test files individually before broad Node-suite validation.']),
    checkpoint: Object.freeze([COMPACT_CHECKPOINT]),
  }),
  Object.freeze({
    id: 'static-assets',
    area: 'Static application assets',
    patterns: Object.freeze([/^static\//]),
    required: Object.freeze(['diff', 'build']),
    iteration: Object.freeze(['Iteration: inspect affected pages/assets under npm run dev; do not rebuild the application after every presentation-only asset edit.']),
    checkpoint: Object.freeze(['Checkpoint: when the static-asset change is coherent, run npm run build; use npm run dev for visual verification rather than the full validation contract.']),
  }),
  Object.freeze({
    id: 'application-code',
    area: 'Application code',
    patterns: Object.freeze([/^src\//]),
    excludePatterns: Object.freeze([/\/AGENTS\.md$/]),
    required: Object.freeze(['diff', 'test', 'svelte', 'build']),
    iteration: Object.freeze([FOCUSED_LOGIC_ITERATION]),
    checkpoint: Object.freeze([COMPACT_CHECKPOINT]),
  }),
  Object.freeze({
    id: 'documentation',
    area: 'Documentation / agent guidance',
    patterns: Object.freeze([/^docs\//, /(?:^|\/)AGENTS\.md$/, /\.md$/]),
    required: Object.freeze(['diff']),
    iteration: Object.freeze(['Iteration: inspect the edited documentation directly; no application test/build loop is required for prose-only changes.']),
  }),
]);

/** @param {string} file */
export function normalizeChangedPath(file) {
  return String(file ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

/** @param {ValidationRule} rule @param {string} file */
function ruleMatches(rule, file) {
  const included = rule.patterns.some((pattern) => pattern.test(file));
  const excluded = rule.excludePatterns?.some((pattern) => pattern.test(file)) ?? false;
  return included && !excluded;
}

/** @param {string} file */
function isImportantUnknown(file) {
  if (/^(src|scripts|tools)\//.test(file)) return true;
  if (/^\.github\//.test(file) && !/(?:^|\/)AGENTS\.md$/.test(file)) return true;
  if (/\.(?:js|mjs|cjs|ts|json|yml|yaml|toml)$/.test(file)) return true;
  return false;
}

/** @param {string[]} values */
function uniqueInCheckOrder(values) {
  const set = new Set(values);
  const ordered = VALIDATION_CHECK_ORDER.filter((checkId) => set.has(checkId));
  if (ordered.length !== set.size) {
    const missing = [...set].filter((checkId) => !VALIDATION_CHECK_ORDER.includes(checkId));
    throw new Error(`Changed-path validation rules reference unordered checks: ${missing.join(', ')}`);
  }
  return ordered;
}

/** @param {string[]} files */
function changedTestIterationGuidance(files) {
  const tests = files.filter(isMaintainedNodeTestPath);
  if (tests.length === 0) return [];
  if (tests.length <= 3) return tests.map((file) => `Iteration: run changed test directly: node --test ${file}`);
  return [`Iteration: run the ${tests.length} changed test files directly before broad Node-suite validation.`];
}

/**
 * Deterministically classify repository paths into validation requirements.
 * One rule set owns both agent advisory requirements and the specialized subset
 * ordinary CI adds to its repository-owned fast/full base mode. Iteration and
 * checkpoint guidance is advisory only; final required checks remain unchanged.
 * @param {string[]} changedFiles
 */
export function classifyChangedFiles(changedFiles) {
  const files = [...new Set(changedFiles.map(normalizeChangedPath).filter(Boolean))].sort();
  const matchedRules = new Set();
  /** @type {string[]} */
  const required = [];
  /** @type {string[]} */
  const specializedRequired = [];
  /** @type {string[]} */
  const recommendations = [];
  /** @type {string[]} */
  const iterationGuidance = [];
  /** @type {string[]} */
  const checkpointGuidance = [];
  /** @type {string[]} */
  const unclassifiedImportant = [];

  for (const file of files) {
    let fileMatched = false;
    for (const rule of VALIDATION_RULES) {
      if (!ruleMatches(rule, file)) continue;
      fileMatched = true;
      matchedRules.add(rule.id);
      required.push(...rule.required);
      specializedRequired.push(...(rule.specializedRequired ?? []));
      recommendations.push(...(rule.recommendations ?? []));
      iterationGuidance.push(...(rule.iteration ?? []));
      checkpointGuidance.push(...(rule.checkpoint ?? []));
    }
    if (!fileMatched && isImportantUnknown(file)) {
      unclassifiedImportant.push(file);
      required.push(...ORDINARY_FULL_CHECKS);
      specializedRequired.push(...CI_SPECIALIZED_CHECK_IDS);
      iterationGuidance.push(FOCUSED_LOGIC_ITERATION);
      checkpointGuidance.push(COMPACT_CHECKPOINT);
    }
  }

  iterationGuidance.push(...changedTestIterationGuidance(files));

  /** @type {string[]} */
  const areas = [];
  for (const rule of VALIDATION_RULES) {
    if (matchedRules.has(rule.id)) areas.push(rule.area);
  }
  if (unclassifiedImportant.length) areas.push('Unclassified code/tooling (fail-safe)');

  const specificApplicationArea = areas.some((area) => [
    'Admin / Svelte routes',
    'Database schema / migrations',
    'Database read/write logic',
    'Authentication / Better Auth',
  ].includes(area));
  const filteredAreas = specificApplicationArea ? areas.filter((area) => area !== 'Application code') : areas;
  const filteredIterationGuidance = specificApplicationArea
    ? iterationGuidance.filter((value) => value !== FOCUSED_LOGIC_ITERATION)
    : iterationGuidance;
  const filteredCheckpointGuidance = specificApplicationArea
    ? checkpointGuidance.filter((value) => value !== COMPACT_CHECKPOINT)
    : checkpointGuidance;
  const specializedRequiredChecks = uniqueInCheckOrder(specializedRequired);
  const requiredChecks = uniqueInCheckOrder([...required, ...specializedRequiredChecks]);
  const notRequired = SPECIALIZED_CHECK_IDS.filter((checkId) => !requiredChecks.includes(checkId));

  return {
    files,
    areas: [...new Set(filteredAreas)],
    iterationGuidance: [...new Set(filteredIterationGuidance)],
    checkpointGuidance: [...new Set(filteredCheckpointGuidance)],
    requiredChecks,
    requiredCommands: requiredChecks.map(formatValidationCommand),
    specializedRequiredChecks,
    specializedRequiredCommands: specializedRequiredChecks.map(formatValidationCommand),
    recommendations: [...new Set(recommendations)],
    notRequiredChecks: notRequired,
    notRequiredCommands: notRequired.map(formatValidationCommand),
    unclassifiedImportant,
  };
}
