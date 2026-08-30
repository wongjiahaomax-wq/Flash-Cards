import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolveFastNodeTestSelection } from './test-selection.mjs';

const REPORTER = './scripts/checkpoint6-file-profile-reporter.mjs';
const selection = await resolveFastNodeTestSelection(process.cwd());

console.log(
  `CP6_PROFILE_FILES|maintained=${selection.complete.length}|selected=${selection.selected.length}|excluded=${selection.excluded.length}`,
);

for (let run = 1; run <= 3; run += 1) {
  const started = performance.now();
  const result = spawnSync('npm', ['test', '--', `--test-reporter=${REPORTER}`], {
    stdio: 'inherit',
    shell: false,
    env: {
      ...process.env,
      CP6_PROFILE_RUN: String(run),
    },
  });
  const wallMs = performance.now() - started;
  const status = Number.isInteger(result.status) ? result.status : -1;
  console.log(`CP6_PROFILE_FILES|run=${run}|wall_ms=${wallMs.toFixed(1)}|status=${status}`);
}

// Profiling is deliberately non-gating. Ordinary repository validation below
// remains the sole pass/fail owner while this temporary Checkpoint 6 profiler is present.
process.exitCode = 0;
