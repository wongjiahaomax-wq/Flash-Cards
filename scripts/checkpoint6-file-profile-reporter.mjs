import path from 'node:path';

const run = process.env.CP6_PROFILE_RUN || 'unknown';

function repositoryPath(file) {
  const relative = path.relative(process.cwd(), String(file ?? ''));
  return relative.split(path.sep).join('/');
}

export default async function* checkpoint6FileProfileReporter(source) {
  for await (const event of source) {
    if (event.type !== 'test:summary') continue;
    const data = event.data ?? {};
    const durationMs = Number.isFinite(data.duration_ms) ? data.duration_ms.toFixed(1) : 'unknown';
    const tests = Number.isInteger(data.counts?.tests) ? data.counts.tests : 'unknown';
    if (data.file) {
      yield `CP6_FILE|run=${run}|file=${repositoryPath(data.file)}|duration_ms=${durationMs}|tests=${tests}\n`;
    } else {
      yield `CP6_FILE_TOTAL|run=${run}|duration_ms=${durationMs}|tests=${tests}\n`;
    }
  }
}
