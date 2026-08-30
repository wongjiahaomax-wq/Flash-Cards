import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolveFastNodeTestSelection } from './test-selection.mjs';

const REPORTER = './scripts/ci-test-reporter.mjs';
const attempt = Number.parseInt(process.env.GITHUB_RUN_ATTEMPT ?? '1', 10) || 1;
const selection = await resolveFastNodeTestSelection(process.cwd());

console.log(
  `CP6_PROFILE|attempt=${attempt}|maintained=${selection.complete.length}|selected=${selection.selected.length}|excluded=${selection.excluded.length}`,
);

const checks = {
  complete: ['test', '--', `--test-reporter=${REPORTER}`],
  fast: ['run', 'test:fast', '--', `--test-reporter=${REPORTER}`],
};

const order = attempt % 2 === 0 ? ['fast', 'complete'] : ['complete', 'fast'];
console.log(`CP6_PROFILE|attempt=${attempt}|order=${order.join(',')}`);

for (const suite of order) {
  const started = performance.now();
  const result = spawnSync('npm', checks[suite], {
    stdio: 'inherit',
    shell: false,
  });
  const wallMs = performance.now() - started;
  const status = Number.isInteger(result.status) ? result.status : -1;
  const error = result.error ? result.error.message.replaceAll('|', '%7C').replaceAll('\n', '%0A') : '';
  console.log(
    `CP6_PROFILE|attempt=${attempt}|suite=${suite}|wall_ms=${wallMs.toFixed(1)}|status=${status}${error ? `|error=${error}` : ''}`,
  );
}

// Measurement is deliberately non-gating. Ordinary repository validation below
// remains the sole pass/fail owner for Draft CI while this temporary profiler is present.
process.exitCode = 0;
