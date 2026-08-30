import path from 'node:path';
import { FAST_TEST_EXCLUSIONS } from './test-selection.mjs';

const run = process.env.CP6_PROFILE_RUN || 'unknown';
const TOP_FILE_COUNT = 30;
const exclusions = new Set(FAST_TEST_EXCLUSIONS);

function repositoryPath(file) {
  const relative = path.relative(process.cwd(), String(file ?? ''));
  return relative.split(path.sep).join('/');
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(sortedValues.length - 1, Math.floor((sortedValues.length - 1) * fraction));
  return sortedValues[index];
}

export default async function* checkpoint6FileProfileReporter(source) {
  const files = [];

  for await (const event of source) {
    if (event.type !== 'test:summary') continue;
    const data = event.data ?? {};
    const durationMs = Number.isFinite(data.duration_ms) ? data.duration_ms : null;
    const tests = Number.isInteger(data.counts?.tests) ? data.counts.tests : null;

    if (data.file) {
      files.push({
        file: repositoryPath(data.file),
        durationMs,
        tests,
      });
      continue;
    }

    const measured = files.filter((entry) => Number.isFinite(entry.durationMs));
    const ranked = [...measured].sort((a, b) => b.durationMs - a.durationMs || a.file.localeCompare(b.file));
    const ascending = measured.map((entry) => entry.durationMs).sort((a, b) => a - b);
    const sumMs = ascending.reduce((sum, value) => sum + value, 0);
    const suiteMs = Number.isFinite(durationMs) ? durationMs : 0;

    yield `CP6_FILE_DIST|run=${run}|files=${files.length}|sum_file_ms=${sumMs.toFixed(1)}|median_file_ms=${percentile(ascending, 0.5).toFixed(1)}|p90_file_ms=${percentile(ascending, 0.9).toFixed(1)}|max_file_ms=${(ascending.at(-1) ?? 0).toFixed(1)}|suite_ms=${suiteMs.toFixed(1)}\n`;

    for (const [index, entry] of ranked.slice(0, TOP_FILE_COUNT).entries()) {
      yield `CP6_FILE_TOP|run=${run}|rank=${index + 1}|file=${entry.file}|duration_ms=${entry.durationMs.toFixed(1)}|tests=${entry.tests ?? 'unknown'}\n`;
    }

    for (const file of FAST_TEST_EXCLUSIONS) {
      const entry = measured.find((candidate) => candidate.file === file);
      yield `CP6_FILE_EXCLUDED|run=${run}|file=${file}|duration_ms=${entry?.durationMs?.toFixed(1) ?? 'missing'}|tests=${entry?.tests ?? 'missing'}\n`;
    }

    const topTenMs = ranked.slice(0, 10).reduce((sum, entry) => sum + entry.durationMs, 0);
    const excludedMs = measured
      .filter((entry) => exclusions.has(entry.file))
      .reduce((sum, entry) => sum + entry.durationMs, 0);
    yield `CP6_FILE_SHARE|run=${run}|top10_sum_ms=${topTenMs.toFixed(1)}|excluded_sum_ms=${excludedMs.toFixed(1)}|suite_ms=${suiteMs.toFixed(1)}\n`;
    yield `CP6_FILE_TOTAL|run=${run}|duration_ms=${durationMs?.toFixed(1) ?? 'unknown'}|tests=${tests ?? 'unknown'}\n`;
  }
}
