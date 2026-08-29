import path from 'node:path';
import { inspect } from 'node:util';

const PROGRESS_WIDTH = 80;
const STACK_LINES = 12;

/** @typedef {Error & { code?: unknown, failureType?: unknown, cause?: unknown, operator?: unknown, expected?: unknown, actual?: unknown }} TestError */

/** @param {unknown} value */
function escapeGithubCommandProperty(value) {
  return String(value ?? '')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');
}

/** @param {unknown} value */
function escapeGithubCommandData(value) {
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
  return /^[A-Za-z0-9_./:@+-]+$/.test(value) ? value : JSON.stringify(value);
}

/** @param {unknown} file */
function repositoryPath(file) {
  if (!file) return null;
  const filename = String(file);
  const relative = path.relative(process.cwd(), filename);
  if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return filename.split(path.sep).join('/');
}

/** @param {unknown} wrapper @returns {TestError | null} */
function actualTestError(wrapper) {
  if (!(wrapper instanceof Error)) return null;
  const error = /** @type {TestError} */ (wrapper);
  if (error.cause instanceof Error) return /** @type {TestError} */ (error.cause);
  return error;
}

/** @param {unknown} value */
function formatValue(value) {
  return inspect(value, {
    depth: 6,
    breakLength: 100,
    compact: false,
    maxArrayLength: 50,
    maxStringLength: 4000,
  });
}

/** @param {unknown} value @param {string} [prefix] */
function indentBlock(value, prefix = '      ') {
  return String(value).split(/\r?\n/).map((line) => `${prefix}${line}`).join('\n');
}

/** @param {unknown} value */
function firstLine(value) {
  return String(value ?? '').split(/\r?\n/, 1)[0];
}

/** @param {TestError | null} error */
function usefulStack(error) {
  const stack = String(error?.stack ?? '').split(/\r?\n/);
  const firstFrame = stack.findIndex((line) => /^\s+at\s/.test(line));
  if (firstFrame >= 0) return stack.slice(firstFrame, firstFrame + STACK_LINES).join('\n');
  if (stack.length <= 1) return null;
  return stack.slice(1, STACK_LINES + 1).join('\n');
}

/** @param {any} data */
export function formatTestFailure(data) {
  const wrapper = data?.details?.error;
  const error = actualTestError(wrapper);
  const file = repositoryPath(data?.file);
  const location = file
    ? `${file}${data?.line ? `:${data.line}${data?.column ? `:${data.column}` : ''}` : ''}`
    : null;
  const lines = [`${data?.name ?? '<unnamed test>'}`];
  if (location) lines.push(`   location: ${location}`);
  if (wrapper instanceof Error && /** @type {TestError} */ (wrapper).failureType) {
    lines.push(`   failureType: ${String(/** @type {TestError} */ (wrapper).failureType)}`);
  }

  if (error) {
    const errorName = error.name || 'Error';
    const code = error.code ? ` [${String(error.code)}]` : '';
    lines.push(`   error: ${errorName}${code}: ${firstLine(error.message)}`);
    if (error.operator) lines.push(`   operator: ${String(error.operator)}`);
    if (Object.hasOwn(error, 'expected')) {
      lines.push('   expected:');
      lines.push(indentBlock(formatValue(error.expected)));
    }
    if (Object.hasOwn(error, 'actual')) {
      lines.push('   actual:');
      lines.push(indentBlock(formatValue(error.actual)));
    }
    const stack = usefulStack(error);
    if (stack) {
      lines.push('   stack:');
      lines.push(indentBlock(stack));
    }
  } else if (wrapper) {
    lines.push(`   error: ${String(wrapper)}`);
  } else {
    lines.push('   error: test failed without an Error payload');
  }
  return lines.join('\n');
}

/** @param {any} data */
export function githubFailureAnnotation(data) {
  const wrapper = data?.details?.error;
  const error = actualTestError(wrapper);
  const file = repositoryPath(data?.file);
  const properties = ['title=Node test failure'];
  if (file) properties.push(`file=${escapeGithubCommandProperty(file)}`);
  if (data?.line) properties.push(`line=${data.line}`);
  if (data?.column) properties.push(`col=${data.column}`);
  const detail = error
    ? `${data?.name ?? '<unnamed test>'}: ${error.name || 'Error'}${error.code ? ` [${String(error.code)}]` : ''}: ${firstLine(error.message)}`
    : `${data?.name ?? '<unnamed test>'}: ${wrapper ? String(wrapper) : 'test failed without an Error payload'}`;
  return `::error ${properties.join(',')}::${escapeGithubCommandData(detail)}`;
}

/** @param {any} data */
export function agentFailureRecord(data) {
  const wrapper = data?.details?.error;
  const error = actualTestError(wrapper);
  const file = repositoryPath(data?.file);
  const message = error
    ? firstLine(error.message)
    : wrapper
      ? firstLine(wrapper)
      : 'test failed without an Error payload';
  const fields = [
    'check=test',
    file ? `file=${escapeAgentField(file)}` : null,
    data?.line ? `line=${escapeAgentField(data.line)}` : null,
    `name=${escapeAgentField(data?.name ?? '<unnamed test>')}`,
    error?.code ? `code=${escapeAgentField(error.code)}` : null,
    `message=${escapeAgentField(message)}`,
  ].filter(Boolean);
  return `CI_ERROR|${fields.join('|')}`;
}

/** @param {any} data */
export function agentReproRecord(data) {
  const file = repositoryPath(data?.file);
  if (!file) return null;
  const command = `npm test -- ${commandArgument(file)}`;
  return `CI_REPRO|check=test|command=${escapeAgentField(command)}`;
}

/** @param {AsyncIterable<any>} source */
export default async function* ciTestReporter(source) {
  let progress = '';
  const failures = [];
  let summary = null;

  for await (const event of source) {
    if (event.type === 'test:pass' || event.type === 'test:fail') {
      const data = event.data ?? {};
      if (data.todo) {
        progress += 'T';
      } else if (event.type === 'test:pass' && data.skip) {
        progress += 'S';
      } else if (event.type === 'test:fail') {
        progress += 'F';
        failures.push(data);
      } else if (data.details?.type !== 'suite') {
        progress += '.';
      }
      if (progress.length >= PROGRESS_WIDTH) {
        yield `${progress}\n`;
        progress = '';
      }
    } else if (event.type === 'test:summary' && !event.data?.file) {
      summary = event.data;
    }
  }

  if (progress) yield `${progress}\n`;

  if (summary?.counts) {
    const { tests, passed, failed, skipped, todo, cancelled } = summary.counts;
    const seconds = Number.isFinite(summary.duration_ms) ? ` in ${(summary.duration_ms / 1000).toFixed(2)}s` : '';
    yield `Tests: ${tests} total, ${passed} passed, ${failed} failed, ${skipped} skipped, ${todo} todo, ${cancelled} cancelled${seconds}\n`;
  }

  if (failures.length > 0) {
    yield `\n=== Node test failures (${failures.length}) ===\n`;
    for (let index = 0; index < failures.length; index += 1) {
      const failure = failures[index];
      yield `\n${index + 1}) ${formatTestFailure(failure)}\n`;
      yield `${githubFailureAnnotation(failure)}\n`;
    }

    yield '\n=== CI AGENT SUMMARY ===\n';
    const reproRecords = new Set();
    for (const failure of failures) {
      yield `${agentFailureRecord(failure)}\n`;
      const reproRecord = agentReproRecord(failure);
      if (reproRecord && !reproRecords.has(reproRecord)) {
        reproRecords.add(reproRecord);
        yield `${reproRecord}\n`;
      }
    }
    yield `CI_STATUS|check=test|status=failed|failed=${failures.length}\n`;
  }
}
