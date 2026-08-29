import path from 'node:path';
import { inspect } from 'node:util';

const PROGRESS_WIDTH = 80;
const STACK_LINES = 12;

function escapeGithubCommandProperty(value) {
  return String(value ?? '')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A')
    .replaceAll(':', '%3A')
    .replaceAll(',', '%2C');
}

function escapeGithubCommandData(value) {
  return String(value ?? '')
    .replaceAll('%', '%25')
    .replaceAll('\r', '%0D')
    .replaceAll('\n', '%0A');
}

function repositoryPath(file) {
  if (!file) return null;
  const relative = path.relative(process.cwd(), file);
  if (relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
    return relative.split(path.sep).join('/');
  }
  return String(file).split(path.sep).join('/');
}

function actualTestError(wrapper) {
  if (wrapper?.cause instanceof Error) return wrapper.cause;
  return wrapper instanceof Error ? wrapper : null;
}

function formatValue(value) {
  return inspect(value, {
    depth: 6,
    breakLength: 100,
    compact: false,
    maxArrayLength: 50,
    maxStringLength: 4000,
  });
}

function indentBlock(value, prefix = '      ') {
  return String(value).split(/\r?\n/).map((line) => `${prefix}${line}`).join('\n');
}

function firstLine(value) {
  return String(value ?? '').split(/\r?\n/, 1)[0];
}

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
  const error = actualTestError(wrapper) ?? wrapper;
  const file = repositoryPath(data?.file);
  const location = file
    ? `${file}${data?.line ? `:${data.line}${data?.column ? `:${data.column}` : ''}` : ''}`
    : null;
  const lines = [`${data?.name ?? '<unnamed test>'}`];
  if (location) lines.push(`   location: ${location}`);
  if (wrapper?.failureType) lines.push(`   failureType: ${wrapper.failureType}`);

  if (error) {
    const errorName = error.name || 'Error';
    const code = error.code ? ` [${error.code}]` : '';
    lines.push(`   error: ${errorName}${code}: ${firstLine(error.message ?? String(error))}`);
    if (error.operator) lines.push(`   operator: ${error.operator}`);
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
  const error = actualTestError(wrapper) ?? wrapper;
  const file = repositoryPath(data?.file);
  const properties = ['title=Node test failure'];
  if (file) properties.push(`file=${escapeGithubCommandProperty(file)}`);
  if (data?.line) properties.push(`line=${data.line}`);
  if (data?.column) properties.push(`col=${data.column}`);
  const detail = error
    ? `${data?.name ?? '<unnamed test>'}: ${error.name || 'Error'}${error.code ? ` [${error.code}]` : ''}: ${firstLine(error.message ?? String(error))}`
    : `${data?.name ?? '<unnamed test>'}: test failed without an Error payload`;
  return `::error ${properties.join(',')}::${escapeGithubCommandData(detail)}`;
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
  }
}
