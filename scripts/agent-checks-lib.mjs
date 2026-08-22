import { formatValidationCommand, VALIDATION_MODE_CHECK_IDS } from './validation-contract.mjs';

const ORDINARY_FULL_CHECKS = VALIDATION_MODE_CHECK_IDS.full;
const CHECK_ORDER = Object.freeze([
  'diff',
  'db',
  'test',
  'svelte',
  'build',
  'authSmoke',
  'runtimeSmoke',
  'slideReviewTest',
]);

/** @typedef {{ id: string, area: string, patterns: RegExp[], excludePatterns?: RegExp[], required: readonly string[], recommendations?: readonly string[] }} ValidationRule */

/** @type {ReadonlyArray<ValidationRule>} */
export const VALIDATION_RULES = Object.freeze([
  Object.freeze({
    id: 'admin-svelte',
    area: 'Admin / Svelte routes',
    patterns: Object.freeze([/^src\/routes\/admin\//, /\.svelte$/]),
    required: Object.freeze(['diff', 'test', 'svelte', 'build']),
    recommendations: Object.freeze(['Manual: run npm run dev and inspect the affected Admin or Svelte flow locally.']),
  }),
  Object.freeze({
    id: 'schema-migrations',
    area: 'Database schema / migrations',
    patterns: Object.freeze([/^drizzle\//, /^drizzle\.config\.js$/, /^src\/lib\/server\/db\/schema\.js$/]),
    required: Object.freeze(['diff', 'db', 'test', 'svelte', 'build']),
  }),
  Object.freeze({
    id: 'database-code',
    area: 'Database read/write logic',
    patterns: Object.freeze([/^src\/lib\/server\/db\//]),
    excludePatterns: Object.freeze([/^src\/lib\/server\/db\/schema\.js$/, /\/AGENTS\.md$/]),
    required: Object.freeze(['diff', 'db', 'test', 'svelte', 'build']),
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
  }),
  Object.freeze({
    id: 'local-replica',
    area: 'Local production-like replica tooling',
    patterns: Object.freeze([
      /^scripts\/refresh-local-replica(?:-lib)?\.mjs$/,
      /^scripts\/bootstrap-local-admin(?:-lib)?\.mjs$/,
    ]),
    required: Object.freeze(['diff', 'test']),
    recommendations: Object.freeze([
      'Credential-dependent: when authorized local credentials/state are available, exercise the affected local-replica command; do not access production automatically.',
    ]),
  }),
  Object.freeze({
    id: 'slide-review',
    area: 'Slide-review tooling',
    patterns: Object.freeze([/^tools\/slide-import-review\//]),
    required: Object.freeze(['diff', 'slideReviewTest']),
    recommendations: Object.freeze([
      'Conditional command: run npm run slide-review:build when the changed previewer/finalizer build output needs verification.',
    ]),
  }),
  Object.freeze({
    id: 'github-automation',
    area: 'GitHub workflows / automation',
    patterns: Object.freeze([/^\.github\/workflows\//, /^\.github\/dependabot\.yml$/]),
    required: Object.freeze(['diff']),
    recommendations: Object.freeze([
      'Manual: review the changed workflow/automation in GitHub after push and confirm the relevant Actions run; do not emulate GitHub Actions locally unless an established repository mechanism exists.',
    ]),
  }),
  Object.freeze({
    id: 'validation-tooling',
    area: 'Coding-agent / validation tooling',
    patterns: Object.freeze([
      /^scripts\/agent-(?:checks|doctor)(?:-lib)?\.mjs$/,
      /^scripts\/validate(?:-ci)?\.mjs$/,
      /^scripts\/validation-contract\.mjs$/,
      /^tests\/agent-tooling\.test\.js$/,
    ]),
    required: Object.freeze([...ORDINARY_FULL_CHECKS]),
  }),
  Object.freeze({
    id: 'tests',
    area: 'Automated tests',
    patterns: Object.freeze([/^tests\//]),
    excludePatterns: Object.freeze([/^tests\/agent-tooling\.test\.js$/]),
    required: Object.freeze(['diff', 'test']),
  }),
  Object.freeze({
    id: 'static-assets',
    area: 'Static application assets',
    patterns: Object.freeze([/^static\//]),
    required: Object.freeze(['diff', 'build']),
  }),
  Object.freeze({
    id: 'application-code',
    area: 'Application code',
    patterns: Object.freeze([/^src\//]),
    excludePatterns: Object.freeze([/\/AGENTS\.md$/]),
    required: Object.freeze(['diff', 'test', 'svelte', 'build']),
  }),
  Object.freeze({
    id: 'documentation',
    area: 'Documentation / agent guidance',
    patterns: Object.freeze([/^docs\//, /(?:^|\/)AGENTS\.md$/, /\.md$/]),
    required: Object.freeze(['diff']),
  }),
]);

function normalizePath(file) {
  return String(file ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

/** @param {ValidationRule} rule @param {string} file */
function ruleMatches(rule, file) {
  const included = rule.patterns.some((pattern) => pattern.test(file));
  const excluded = rule.excludePatterns?.some((pattern) => pattern.test(file)) ?? false;
  return included && !excluded;
}

function isImportantUnknown(file) {
  if (/^(src|scripts|tools)\//.test(file)) return true;
  if (/^\.github\//.test(file) && !/(?:^|\/)AGENTS\.md$/.test(file)) return true;
  if (/\.(?:js|mjs|cjs|ts|json|yml|yaml|toml)$/.test(file)) return true;
  return false;
}

function uniqueInCheckOrder(values) {
  const set = new Set(values);
  return CHECK_ORDER.filter((checkId) => set.has(checkId));
}

/**
 * Deterministically classify repository paths into validation requirements.
 * @param {string[]} changedFiles
 */
export function classifyChangedFiles(changedFiles) {
  const files = [...new Set(changedFiles.map(normalizePath).filter(Boolean))].sort();
  const matchedRules = new Set();
  const required = [];
  const recommendations = [];
  const unclassifiedImportant = [];

  for (const file of files) {
    let fileMatched = false;
    for (const rule of VALIDATION_RULES) {
      if (!ruleMatches(rule, file)) continue;
      fileMatched = true;
      matchedRules.add(rule.id);
      required.push(...rule.required);
      recommendations.push(...(rule.recommendations ?? []));
    }
    if (!fileMatched && isImportantUnknown(file)) {
      unclassifiedImportant.push(file);
      required.push(...ORDINARY_FULL_CHECKS);
    }
  }

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
  const requiredChecks = uniqueInCheckOrder(required);
  const notRequired = ['runtimeSmoke', 'slideReviewTest'].filter((checkId) => !requiredChecks.includes(checkId));

  return {
    files,
    areas: [...new Set(filteredAreas)],
    requiredChecks,
    requiredCommands: requiredChecks.map(formatValidationCommand),
    recommendations: [...new Set(recommendations)],
    notRequiredChecks: notRequired,
    notRequiredCommands: notRequired.map(formatValidationCommand),
    unclassifiedImportant,
  };
}
